import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

/** Konverzace jednoho agenta. `api` je přesná historie pro Claude API (jen se přidává, nikdy se needituje). */
export interface Conversation {
  api: Anthropic.Beta.BetaMessageParam[];
  display: DisplayMessage[];
}

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');

function fileFor(agentId: string) {
  return path.join(DATA_DIR, `chat-${agentId}.json`);
}

export async function loadConversation(agentId: string): Promise<Conversation> {
  try {
    return JSON.parse(await readFile(fileFor(agentId), 'utf8')) as Conversation;
  } catch {
    return { api: [], display: [] };
  }
}

export async function saveConversation(agentId: string, conv: Conversation): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const file = fileFor(agentId);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(conv, null, 1), 'utf8');
  await rename(tmp, file);
}
