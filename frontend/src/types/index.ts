export interface SwarmAgent {
  id: string;
  name: string;
  color: string;
  colorHex: string;
  specialty: string;
  personality: string;
  systemPrompt: string;
  isCustom?: boolean;
  templateType?: string;
  steeringPrompts?: string[];
  load: number;
  status: 'idle' | 'thinking' | 'active';
  // Per-agent provider/model/key pinning (optional — falls back to global defaults).
  preferredProvider?: 'openrouter' | 'ollama';
  preferredModel?: string;
  preferredKeyId?: string;
}

export interface SwarmMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  isAgent: boolean;
  timestamp: number;
  taskId?: string;
  replyToId?: string;
  // Filled in when the assistant response completes; used by the cost ledger.
  usage?: MessageUsage;
  // For continuity hints like "continuing from group X" banners.
  contextNote?: string;
}

export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  model: string;
  provider: 'openrouter' | 'ollama';
}

export interface UsageEntry {
  id: string;
  timestamp: number;
  scopeKey: string;      // same key scheme as messages: cc_msgs_agent_<id> / cc_msgs_project_<id>
  agentId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  provider: 'openrouter' | 'ollama';
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  assignedAgents: string[];
  output?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  createdAt: number;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  instruction: string;
}

export interface PinnedMemory {
  id: string;
  agentId: string;
  key: string;       // short label; used as the "name" of the fact
  value: string;     // the actual fact content
  sourceMessageId?: string;
  sourceScopeKey?: string;
  createdAt: number;
}

export interface AgentMemoryEntry {
  agentId: string;
  key: string;
  value: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  agents: string[];
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface SavedChat {
  id: string;
  name: string;
  projectId?: string;
  agentId?: string;
  messages: SwarmMessage[];
  createdAt: number;
  type: 'saved' | 'template';
}

export interface ExternalAsset {
  id: string;
  type: 'github' | 'gitlab' | 'gdrive' | 'onedrive';
  label: string;
  // Metadata only. The actual token is stored via secureStorage and looked up by secretKey.
  secretKey: string;
  // GitHub / GitLab: username/owner. GDrive: email. Optional metadata.
  accountRef?: string;
  connected: boolean;
  connectedAt?: number;
  lastCheckedAt?: number;
}
