import Anthropic from '@anthropic-ai/sdk';
import { AGENTS } from '../src/world/agents.ts';
import { loadConversation, saveConversation, type DisplayMessage } from './store.ts';

export const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export function apiKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
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
const SYSTEM_PROMPT = `Jsi Ondik, hlavní AI asistent a šéf recepce ve virtuální „Kanceláři Ondik“. Je to osobní asistent jednoho člověka: tvého uživatele. Mluvíš s ním česky, přátelsky a věcně, jako šikovný asistent, který ho zná.

Tvůj tým (roboti v kancelářích kolem recepce):
${teamDescription()}

Jak pracuješ:
- Přijímáš požadavky uživatele. Až budou kolegové připojení, budeš jim práci předávat; teď zatím nikdo z týmu není napojený na skutečné nástroje.
- Buď poctivý: nemáš zatím přístup k e-mailu, kalendáři, webu ani souborům. Nepředstírej, že jsi něco zjistil nebo udělal. Když požadavek potřebuje nástroj, řekni, který kolega to bude mít na starosti, a pomoz, jak to jde už teď (rada, návrh textu, plán, připomenutí, co je potřeba připravit).
- Odpovídej stručně, uživatel tě často čte na telefonu. Používej krátké odstavce, případně jednoduché odrážky začínající „- “. Nepoužívej nadpisy ani tabulky.
- V konverzaci dostáváš systémové zprávy s aktuálním datem a časem; počítej s nimi.`;

const busy = new Set<string>();

export function isBusy(agentId: string) {
  return busy.has(agentId);
}

function nowText() {
  return new Date().toLocaleString('cs-CZ', {
    timeZone: process.env.TZ_DISPLAY ?? 'Europe/Prague',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function getHistory(agentId: string): Promise<DisplayMessage[]> {
  return (await loadConversation(agentId)).display;
}

export async function clearHistory(agentId: string) {
  await saveConversation(agentId, { api: [], display: [] });
}

interface ChatHandlers {
  onText: (delta: string) => void;
  signal: AbortSignal;
}

/** Pošle zprávu Ondikovi, streamuje odpověď a uloží konverzaci. Vrací celý text odpovědi. */
export async function chatWithOndik(text: string, { onText, signal }: ChatHandlers): Promise<string> {
  const agentId = 'ondik';
  if (busy.has(agentId)) throw new Error('Ondik ještě odpovídá na předchozí zprávu.');
  busy.add(agentId);
  try {
    const conv = await loadConversation(agentId);
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...conv.api,
      { role: 'user', content: text },
      { role: 'system', content: `Aktuální datum a čas: ${nowText()}.` },
    ];

    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
        // Když Claude Opus 5.5 požadavek odmítne, API ho automaticky zkusí na záložním modelu.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages,
      },
      { signal },
    );
    stream.on('text', onText);
    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      throw new Error('Tuhle žádost Ondik nemůže zpracovat.');
    }

    const reply = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const at = new Date().toISOString();
    await saveConversation(agentId, {
      api: [...messages, { role: 'assistant', content: final.content }],
      display: [...conv.display, { role: 'user', text, at }, { role: 'assistant', text: reply, at: new Date().toISOString() }],
    });
    return reply;
  } finally {
    busy.delete(agentId);
  }
}
