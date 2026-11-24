import Anthropic from '@anthropic-ai/sdk';
import { AGENTS } from '../src/world/agents.ts';
import { loadConversation, saveConversation, type DisplayMessage } from './store.ts';
import { apiKeyConfigured, nowText } from './config.ts';
import { ECHO_MODEL, ECHO_SYSTEM, echoContext } from './echo-chat.ts';
import { CHRONOS_MODEL, CHRONOS_SYSTEM, CHRONOS_TOOLS, TOOL_LABELS, chronosContext, runChronosTool } from './chronos-chat.ts';

export { apiKeyConfigured };

export const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}


function teamDescription(): string {
  return AGENTS.filter((a) => a.id !== 'ondik')
    .map((a) => {
      const tools = a.tools.map((t) => `${t.name} (${t.status === 'connected' ? 'připojeno' : 'zatím nepřipojeno'})`).join(', ');
      return `- ${a.name} – ${a.role}, kancelář „${a.roomName}“. ${a.description} Nástroje: ${tools}.`;
    })
    .join('\n');
}

// Systémový prompt se nemění mezi požadavky, takže se dobře cachuje.
const SYSTEM_PROMPT = `Jsi Ondik, hlavní AI asistent ve virtuálním „Městečku Ondik“. Sídlíš na radnici uprostřed městečka, hned vedle kanceláře svého uživatele, který je tu CEO. Jsi jeho osobní asistent. Mluvíš s ním česky, přátelsky a věcně, jako šikovný asistent, který ho zná.

Tvůj tým (roboti v boxech kolem radnice, kde bydlí i pracují):
${teamDescription()}

Jak pracuješ:
- Časem z tebe bude Jarvis: uživatel s tebou bude mluvit hlasem a budeš mu umět zavolat. Zatím spolu jen píšete.
- Přijímáš požadavky uživatele. Až budou kolegové připojení, budeš jim práci předávat; teď zatím nikdo z týmu není napojený na skutečné nástroje.
- Buď poctivý: nemáš zatím přístup k e-mailu, kalendáři, webu ani souborům. Nepředstírej, že jsi něco zjistil nebo udělal. Když požadavek potřebuje nástroj, řekni, který kolega to bude mít na starosti, a pomoz, jak to jde už teď (rada, návrh textu, plán, připomenutí, co je potřeba připravit).
- Odpovídej stručně, uživatel tě často čte na telefonu. Používej krátké odstavce, případně jednoduché odrážky začínající „- “. Nepoužívej nadpisy ani tabulky.
- V konverzaci dostáváš systémové zprávy s aktuálním datem a časem; počítej s nimi.`;

const busy = new Set<string>();

export function isBusy(agentId: string) {
  return busy.has(agentId);
}


export async function getHistory(agentId: string): Promise<DisplayMessage[]> {
  return (await loadConversation(agentId)).display;
}

export async function clearHistory(agentId: string) {
  await saveConversation(agentId, { api: [], display: [] });
}

interface ChatHandlers {
  onText: (delta: string) => void;
  /** Agent právě používá nástroj (text pro zobrazení, např. „Dívám se do kalendáře…“). */
  onTool?: (label: string) => void;
  signal: AbortSignal;
}

interface AgentChatConfig {
  name: string;
  model: string;
  system: string;
  effort: 'low' | 'medium' | 'high';
  /** Serverová záloha při odmítnutí – jen u modelů, které ji podporují (Opus 5.5 ano, Haiku ne). */
  fallbacks: boolean;
  /** Podklady přiložené ke každé otázce (jako systémová zpráva). */
  context: () => Promise<string>;
  /** Nástroje, které agent smí používat (např. kalendář). */
  tools?: Anthropic.Beta.BetaTool[];
  runTool?: (name: string, input: Record<string, unknown>) => Promise<string>;
  toolLabels?: Record<string, string>;
}

const MAX_TOOL_ROUNDS = 10;

/** Agenti, se kterými se dá psát. */
export const CHAT_AGENTS: Record<string, AgentChatConfig> = {
  ondik: {
    name: 'Ondik',
    model: MODEL,
    system: SYSTEM_PROMPT,
    effort: 'medium',
    fallbacks: true,
    context: async () => `Aktuální datum a čas: ${nowText()}.`,
  },
  chronos: {
    name: 'Chronos',
    model: CHRONOS_MODEL,
    system: CHRONOS_SYSTEM,
    effort: 'medium',
    fallbacks: true,
    context: chronosContext,
    tools: CHRONOS_TOOLS,
    runTool: runChronosTool,
    toolLabels: TOOL_LABELS,
  },
  echo: {
    name: 'Echo',
    model: ECHO_MODEL,
    system: ECHO_SYSTEM,
    effort: 'low',
    fallbacks: false,
    context: echoContext,
  },
};

/** Pošle zprávu agentovi, streamuje odpověď a uloží konverzaci. Vrací celý text odpovědi. */
export async function chatWithAgent(agentId: string, text: string, { onText, onTool, signal }: ChatHandlers): Promise<string> {
  const cfg = CHAT_AGENTS[agentId];
  if (!cfg) throw new Error('S tímto agentem se zatím psát nedá.');
  if (busy.has(agentId)) throw new Error(`${cfg.name} ještě odpovídá na předchozí zprávu.`);
  busy.add(agentId);
  try {
    const conv = await loadConversation(agentId);
    // Historie se jen přidává (nic se v ní nepřepisuje), podklady jdou jako systémová zpráva za otázkou.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...conv.api,
      { role: 'user', content: text },
      { role: 'system', content: await cfg.context() },
    ];

    let reply = '';
    let newRound = false;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = getClient().beta.messages.stream(
        {
          model: cfg.model,
          max_tokens: 16000,
          system: cfg.system,
          cache_control: { type: 'ephemeral' },
          output_config: { effort: cfg.effort },
          // Když model požadavek odmítne, API ho automaticky zkusí na záložním modelu.
          ...(cfg.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          ...(cfg.tools ? { tools: cfg.tools } : {}),
          messages,
        },
        { signal },
      );
      stream.on('text', (t) => {
        // text z dalšího kola (po použití nástroje) oddělíme odstavcem
        if (newRound && reply && !reply.endsWith('\n')) {
          reply += '\n\n';
          onText('\n\n');
        }
        newRound = false;
        reply += t;
        onText(t);
      });
      const final = await stream.finalMessage();

      if (final.stop_reason === 'refusal') throw new Error(`Tuhle žádost ${cfg.name} nemůže zpracovat.`);
      if (final.stop_reason === 'max_tokens') throw new Error('Odpověď se nevešla do limitu, zkus otázku zjednodušit.');
      messages.push({ role: 'assistant', content: final.content });
      if (final.stop_reason !== 'tool_use' || !cfg.runTool) break;

      // provedeme všechny požadované nástroje a výsledky vrátíme v jedné zprávě
      const uses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        onTool?.(cfg.toolLabels?.[u.name] ?? '🔧 Pracuji…');
        try {
          const out = await cfg.runTool(u.name, (u.input ?? {}) as Record<string, unknown>);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: err instanceof Error ? err.message : String(err), is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
      newRound = true;
    }

    const at = new Date().toISOString();
    await saveConversation(agentId, {
      api: messages,
      display: [...conv.display, { role: 'user', text, at }, { role: 'assistant', text: reply, at: new Date().toISOString() }],
    });
    return reply;
  } finally {
    busy.delete(agentId);
  }
}
