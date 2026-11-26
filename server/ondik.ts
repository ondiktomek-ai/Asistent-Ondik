import Anthropic from '@anthropic-ai/sdk';
import { AGENTS } from '../src/world/agents.ts';
import { loadConversation, saveConversation, type ChatAttachment, type DisplayMessage } from './store.ts';
import { LEXA_MODEL, LEXA_SYSTEM, LEXA_TOOLS, LEXA_TOOL_LABELS, lexaContext, runLexaTool } from './lexa.ts';
import { apiKeyConfigured, nowText } from './config.ts';
import { ECHO_MODEL, ECHO_SYSTEM, echoContext } from './echo-chat.ts';
import { recordUsage } from './usage.ts';
import { KLIK_MODEL, KLIK_SYSTEM, KLIK_TOOL_LABELS, OPEN_LINK, OPEN_LINK_TOOL, klikContext, runOpenLink, tilesText } from './klik.ts';
import { randomUUID } from 'node:crypto';
import { ASK_COLLEAGUE, TEAM_TOOL_LABELS, finishTask, runMemoryTool, startTask, teamContext, teamRules, teamTools } from './team.ts';
import { BIT_MODEL, BIT_SYSTEM, BIT_TOOLS, BIT_TOOL_LABELS, bitContext, runBitTool } from './bit-chat.ts';
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
- Jsi šéf týmu. Sám nemáš kalendář, web ani zprávy – ty mají kolegové. Když požadavek potřebuje jejich schopnost, zadej jim úkol nástrojem ask_colleague (klidně víc kolegům, např. Chronos najde volný den a Lexa k němu vyhledá výlet). Jejich výsledky pak uživateli shrň a propoj dohromady.
- Weby a aplikace (YouTube, Spotify, Google…) otevíráš sám nástrojem open_link – rychleji, než kdybys to zadával Klikovi.
- Pošťák (e-mail) a Archivář (dokumenty) zatím nepracují – když jde o e-mail nebo soubory, řekni to na rovinu a pomoz, jak to jde (rada, návrh textu, plán).
- Nikdy nepředstírej, že jsi něco zjistil nebo udělal. Co ti kolega nepotvrdil, nevíš.
- Časem z tebe bude Jarvis: uživatel s tebou bude mluvit hlasem a budeš mu umět zavolat. Zatím spolu jen píšete.
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
  /** Agent něco vytvořil (např. plakátek) – klient ho může hned otevřít. */
  onAttachment?: (a: ChatAttachment) => void;
  signal: AbortSignal;
  /** Doplňující pokyny k této jedné otázce (např. hlasový režim Jarvise). */
  extraContext?: string;
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
  /** Vlastní nástroje i vestavěné nástroje Claude API (např. hledání na webu). */
  tools?: Anthropic.Beta.BetaToolUnion[];
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
    context: async () => `Aktuální datum a čas: ${nowText()}.\n${await tilesText()}`,
    tools: [OPEN_LINK_TOOL],
    toolLabels: { [OPEN_LINK]: '▶️ Otevírám…' },
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
  lexa: {
    name: 'Lexa',
    model: LEXA_MODEL,
    system: LEXA_SYSTEM,
    effort: 'low',
    fallbacks: false,
    context: lexaContext,
    tools: LEXA_TOOLS,
    runTool: runLexaTool,
    toolLabels: LEXA_TOOL_LABELS,
  },
  bit: {
    name: 'Bit',
    model: BIT_MODEL,
    system: BIT_SYSTEM,
    effort: 'low',
    fallbacks: false,
    context: bitContext,
    tools: BIT_TOOLS,
    runTool: runBitTool,
    toolLabels: BIT_TOOL_LABELS,
  },
  klik: {
    name: 'Klik',
    model: KLIK_MODEL,
    system: KLIK_SYSTEM,
    effort: 'low',
    fallbacks: false,
    context: klikContext,
    tools: [OPEN_LINK_TOOL],
    toolLabels: KLIK_TOOL_LABELS,
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

interface RunOptions {
  /** 0 = rozhovor s uživatelem, 1 = úkol od kolegy (ten už další kolegy nezapojuje) */
  depth: number;
  onText?: (delta: string) => void;
  onTool?: (label: string) => void;
  onAttachment?: (a: ChatAttachment) => void;
  signal: AbortSignal;
}

const agentName = (id: string) => CHAT_AGENTS[id]?.name ?? id;

/** Jedno „kolo práce“ agenta: volá Claude, provádí nástroje, dokud agent neodpoví. Zprávy doplňuje do `messages`. */
async function runAgent(agentId: string, messages: Anthropic.Beta.BetaMessageParam[], o: RunOptions): Promise<{ reply: string; attachments: ChatAttachment[] }> {
  const cfg = CHAT_AGENTS[agentId];
  const canAsk = o.depth === 0;
  const tools = [...(cfg.tools ?? []), ...teamTools(agentId, canAsk)];
  const system = cfg.system + teamRules(agentId, canAsk);
  const labels = { ...TEAM_TOOL_LABELS, ...cfg.toolLabels };

  let reply = '';
  let newRound = false;
  const attachments: ChatAttachment[] = [];
  const attach = (a: ChatAttachment) => {
    attachments.push(a);
    o.onAttachment?.(a);
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = getClient().beta.messages.stream(
      {
        model: cfg.model,
        max_tokens: 16000,
        system,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: cfg.effort },
        // Když model požadavek odmítne, API ho automaticky zkusí na záložním modelu.
        ...(cfg.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        tools,
        messages,
      },
      { signal: o.signal },
    );
    stream.on('text', (t) => {
      // text z dalšího kola (po použití nástroje) oddělíme odstavcem
      if (newRound && reply && !reply.endsWith('\n')) {
        reply += '\n\n';
        o.onText?.('\n\n');
      }
      newRound = false;
      reply += t;
      o.onText?.(t);
    });
    // vestavěné nástroje (hledání na webu) běží u Claude – ukážeme aspoň, že se hledá
    stream.on('streamEvent', (ev) => {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') {
        o.onTool?.(labels[ev.content_block.name] ?? '🔎 Hledám…');
      }
    });
    const final = await stream.finalMessage();
    recordUsage(agentId, final.model || cfg.model, final.usage);

    if (final.stop_reason === 'refusal') throw new Error(`Tuhle žádost ${cfg.name} nemůže zpracovat.`);
    if (final.stop_reason === 'max_tokens') throw new Error('Odpověď se nevešla do limitu, zkus otázku zjednodušit.');
    messages.push({ role: 'assistant', content: final.content });
    // dlouhé hledání na webu Claude přeruší „pause_turn“ – pošleme to samé znovu a on pokračuje
    if (final.stop_reason === 'pause_turn') {
      newRound = true;
      continue;
    }
    if (final.stop_reason !== 'tool_use') break;

    // všechny požadované nástroje najednou (např. dva kolegové pracují souběžně), výsledky v jedné zprávě
    const uses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const results = await Promise.all(
      uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const input = (u.input ?? {}) as Record<string, unknown>;
        try {
          if (u.name === ASK_COLLEAGUE) {
            const out = await askColleague(agentId, String(input.agent ?? ''), String(input.task ?? ''), { ...o, onAttachment: attach });
            return { type: 'tool_result', tool_use_id: u.id, content: out };
          }
          o.onTool?.(labels[u.name] ?? '🔧 Pracuji…');
          const mem = await runMemoryTool(agentId, u.name, input);
          if (mem !== null) return { type: 'tool_result', tool_use_id: u.id, content: mem };
          if (u.name === OPEN_LINK) {
            const link = await runOpenLink(input);
            attach({ kind: 'link', id: randomUUID().slice(0, 8), title: link.title, url: link.url });
            return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify({ otevreno: true, ...link }) };
          }
          if (!cfg.runTool) throw new Error(`Nástroj ${u.name} tu není.`);
          const out = await cfg.runTool(u.name, input);
          if (u.name === 'create_poster') {
            const r = JSON.parse(out) as { id: string; titulek: string };
            attach({ kind: 'lexa-poster', id: r.id, title: r.titulek });
          }
          return { type: 'tool_result', tool_use_id: u.id, content: out };
        } catch (err) {
          if (o.signal.aborted) throw err;
          return { type: 'tool_result', tool_use_id: u.id, content: err instanceof Error ? err.message : String(err), is_error: true };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
    newRound = true;
  }
  return { reply, attachments };
}

/** Agent zadá úkol kolegovi: kolega ho zpracuje se svými nástroji (bez historie chatu) a vrátí odpověď. */
async function askColleague(fromId: string, toId: string, task: string, o: RunOptions): Promise<string> {
  if (!CHAT_AGENTS[toId] || toId === fromId) throw new Error(`Kolega „${toId}“ neexistuje.`);
  if (!task.trim()) throw new Error('Chybí zadání úkolu.');
  o.onTool?.(`🤝 Zadávám úkol: ${agentName(toId)}…`);
  const t = startTask(fromId, toId, task);
  try {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: `Úkol od kolegy ${agentName(fromId)}:\n${task}` },
      { role: 'system', content: `${await CHAT_AGENTS[toId].context()}\n\n${await teamContext()}` },
    ];
    const { reply } = await runAgent(toId, messages, {
      depth: o.depth + 1,
      signal: o.signal,
      onAttachment: o.onAttachment,
      // „🔎 Hledám na webu…“ → „🔎 Lexa: Hledám na webu…“
      onTool: (label) => {
        const [icon, ...rest] = label.split(' ');
        o.onTool?.(rest.length ? `${icon} ${agentName(toId)}: ${rest.join(' ')}` : `${agentName(toId)}: ${label}`);
      },
    });
    const text = reply.trim() || '(kolega neodpověděl textem)';
    finishTask(t, true, text);
    o.onTool?.(`💭 ${agentName(fromId)} skládá odpověď…`);
    return `${agentName(toId)} odpovídá:\n${text}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishTask(t, false, msg);
    if (o.signal.aborted) throw err;
    throw new Error(`${agentName(toId)} úkol nezvládl: ${msg}`);
  }
}

const HISTORY_MAX = 120;
const HISTORY_KEEP = 50;

/** Zkrátí historii pro API: začne na skutečné otázce uživatele (ne uprostřed práce s nástroji). */
export function trimHistory(api: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  if (api.length <= HISTORY_MAX) return api;
  for (let i = api.length - HISTORY_KEEP; i < api.length; i++) {
    const m = api[i];
    if (m.role === 'user' && typeof m.content === 'string') return api.slice(i);
  }
  return [];
}

/** Pošle zprávu agentovi, streamuje odpověď a uloží konverzaci. Vrací celý text odpovědi. */
export async function chatWithAgent(agentId: string, text: string, { onText, onTool, onAttachment, signal, extraContext }: ChatHandlers): Promise<string> {
  const cfg = CHAT_AGENTS[agentId];
  if (!cfg) throw new Error('S tímto agentem se zatím psát nedá.');
  if (busy.has(agentId)) throw new Error(`${cfg.name} ještě odpovídá na předchozí zprávu.`);
  busy.add(agentId);
  try {
    const conv = await loadConversation(agentId);
    // Historie se jen přidává (nic se v ní nepřepisuje), podklady jdou jako systémová zpráva za otázkou.
    // Aby každá další otázka nebyla dražší a dražší, nechá se jen posledních pár desítek zpráv –
    // zkracuje se po větších kusech (jednou za čas), ať se dál dobře využívá cache.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...trimHistory(conv.api),
      { role: 'user', content: text },
      { role: 'system', content: `${await cfg.context()}\n\n${await teamContext()}${extraContext ? `\n\n${extraContext}` : ''}` },
    ];
    const { reply, attachments } = await runAgent(agentId, messages, { depth: 0, onText, onTool, onAttachment, signal });
    const at = new Date().toISOString();
    await saveConversation(agentId, {
      api: messages,
      display: [...conv.display, { role: 'user' as const, text, at }, { role: 'assistant' as const, text: reply, at: new Date().toISOString(), ...(attachments.length ? { attachments } : {}) }].slice(-300),
    });
    return reply;
  } finally {
    busy.delete(agentId);
  }
}
