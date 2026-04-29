// ─── Route Constants ───────────────────────────────────────────────────────────
export const ROUTE_PATHS = {
  HOME: '/',
  AGENTS: '/agents',
  AGENT_DETAIL: '/agents/:id',
  AGENT_NEW: '/agents/new',
  GITHUB: '/github',
  SKILLS: '/skills',
  CONFIGS: '/configs',
  SETTINGS: '/settings',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
export type AgentStatus = 'running' | 'idle' | 'error' | 'stopped';
export type ModelType = 'GPT-4o' | 'Claude 3.5' | 'Gemini Pro' | 'Llama 3.3' | 'DeepSeek R1' | 'Mistral Large';
export type SkillCategory = 'Dev Tools' | 'Research' | 'Security' | 'Data' | 'Communication' | 'Productivity';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  model: ModelType;
  uptime: string;
  taskCount: number;
  activeTask?: string;
  skills: string[];
  repoUrl?: string;
  repoBranch?: string;
  configId?: string;
  lastSeen: string;
  memoryUsage: number; // percentage
  cpuUsage: number; // percentage
  logs: LogEntry[];
  envVars: Record<string, string>;
  description?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
}

export interface GitRepo {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  language: string;
  stars: number;
  updatedAt: string;
  branches: string[];
  defaultBranch: string;
  lastCommit: string;
  appliedAgents: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  installed: boolean;
  tags: string[];
  icon: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  format: 'json' | 'yaml' | 'env';
  content: string;
  appliedTo: string[];
  updatedAt: string;
  description?: string;
}

export interface PullRequest {
  id: string;
  title: string;
  number: number;
  status: 'open' | 'merged' | 'closed';
  author: string;
  createdAt: string;
  labels: string[];
}
