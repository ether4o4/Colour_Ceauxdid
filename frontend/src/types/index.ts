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
  agentId: string;
  instruction: string;
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
  agents: string[]; // agent IDs
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
  token?: string;
  connected: boolean;
  connectedAt?: number;
}
