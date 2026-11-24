export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Vizuální motiv kanceláře – určuje nábytek a podlahu. */
export type ThemeId = 'mail' | 'calendar' | 'research' | 'finance' | 'workshop' | 'newsroom' | 'townhall';

export type ToolStatus = 'planned' | 'connected';

export interface AgentTool {
  name: string;
  description: string;
  status: ToolStatus;
}

export type AgentStatus = 'setup' | 'idle' | 'working' | 'offline';

export interface AgentDef {
  id: string;
  /** Jméno robota. */
  name: string;
  /** Krátká role, např. „E-mailový agent“. */
  role: string;
  /** Název kanceláře. */
  roomName: string;
  description: string;
  icon: string;
  /** Hlavní barva robota a kanceláře. */
  color: string;
  theme: ThemeId;
  status: AgentStatus;
  duties: string[];
  tools: AgentTool[];
  /** Hlášky, které robot občas řekne, když se fláká po kanceláři. */
  idleLines: string[];
}
