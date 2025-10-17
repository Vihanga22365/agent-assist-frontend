export type ChatRole = 'customer' | 'assistant' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  author: string;
  time: string;
  text: string;
  highlights?: string[];
}

export interface SummaryPoint {
  label: string;
  value: string;
  tone?: 'positive' | 'neutral' | 'warning';
}

export type AgentAiRole = 'human_agent' | 'ai_agent';

export interface AgentAiMessage {
  id: string;
  role: AgentAiRole;
  author: string;
  time: string;
  text: string;
}
