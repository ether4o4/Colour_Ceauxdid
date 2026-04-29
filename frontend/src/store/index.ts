import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SwarmAgent, SwarmMessage, Task, Workflow, Project, SavedChat, ExternalAsset,
} from '../types';

/**
 * Storage keys.
 *
 * Messages are scoped per-context so that every 1-on-1 and every group
 * is fully isolated. Legacy `cc_messages` is kept only for one-time migration.
 */
const KEYS = {
  LEGACY_MESSAGES: 'cc_messages',
  MSG_PREFIX: 'cc_msgs_',          // cc_msgs_agent_<id> | cc_msgs_project_<id>
  MIGRATION_DONE: 'cc_migration_v2_done',
  TASKS: 'cc_tasks',
  WORKFLOWS: 'cc_workflows',
  CUSTOM_AGENTS: 'cc_custom_agents',
  AGENT_MEMORY: 'cc_agent_memory',
  COMMAND_MEMORY: 'cc_command_memory',
  SETTINGS: 'cc_settings',
  PROJECTS: 'cc_projects',
  SAVED_CHATS: 'cc_saved_chats',
  EXTERNAL_ASSETS: 'cc_external_assets',
  ACTIVE_PROJECT: 'cc_active_project',
  API_KEYS: 'cc_api_keys',
  PROVIDER_SETTINGS: 'cc_provider_settings',
};

// ───────────────────── Message scopes ─────────────────────
export type ChatScope =
  | { type: 'agent'; id: string }
  | { type: 'project'; id: string };

export function scopeKey(scope: ChatScope): string {
  return `${KEYS.MSG_PREFIX}${scope.type}_${scope.id}`;
}

// Migrate any legacy global messages into a single "legacy" project bucket ONCE.
// This preserves old data instead of losing it, and makes the separation explicit.
async function runMigrationIfNeeded() {
  const done = await AsyncStorage.getItem(KEYS.MIGRATION_DONE);
  if (done === '1') return;
  const legacy = await AsyncStorage.getItem(KEYS.LEGACY_MESSAGES);
  if (legacy) {
    // Park it under a special scope so users can still access their old chat
    // via a "Legacy Chat" project without polluting any specific new chat.
    await AsyncStorage.setItem(`${KEYS.MSG_PREFIX}project_legacy`, legacy);
    await AsyncStorage.removeItem(KEYS.LEGACY_MESSAGES);
  }
  await AsyncStorage.setItem(KEYS.MIGRATION_DONE, '1');
}

export async function getMessages(scope: ChatScope): Promise<SwarmMessage[]> {
  await runMigrationIfNeeded();
  const raw = await AsyncStorage.getItem(scopeKey(scope));
  return raw ? JSON.parse(raw) : [];
}

export async function saveMessage(msg: SwarmMessage, scope: ChatScope): Promise<void> {
  await runMigrationIfNeeded();
  const key = scopeKey(scope);
  const raw = await AsyncStorage.getItem(key);
  const arr: SwarmMessage[] = raw ? JSON.parse(raw) : [];
  arr.push(msg);
  // Trim to last 500 per scope to keep storage bounded.
  const trimmed = arr.slice(-500);
  await AsyncStorage.setItem(key, JSON.stringify(trimmed));
}

export async function updateMessage(msg: SwarmMessage, scope: ChatScope): Promise<void> {
  const key = scopeKey(scope);
  const raw = await AsyncStorage.getItem(key);
  const arr: SwarmMessage[] = raw ? JSON.parse(raw) : [];
  const idx = arr.findIndex(m => m.id === msg.id);
  if (idx >= 0) arr[idx] = msg;
  else arr.push(msg);
  await AsyncStorage.setItem(key, JSON.stringify(arr.slice(-500)));
}

export async function clearScope(scope: ChatScope): Promise<void> {
  await AsyncStorage.removeItem(scopeKey(scope));
}

/**
 * Returns group-chat messages from every project in which `agentId` is a
 * participant. Used to satisfy the rule:
 *   group chat memory -> flows into 1-on-1 chat
 *   1-on-1 chat       -> does NOT flow back into group
 */
export async function getGroupMessagesForAgent(
  agentId: string,
  limit = 40,
): Promise<SwarmMessage[]> {
  const projects = await getProjects();
  const relevantProjects = projects.filter(p => p.agents.includes(agentId));
  const all: SwarmMessage[] = [];
  for (const p of relevantProjects) {
    const msgs = await getMessages({ type: 'project', id: p.id });
    // Tag with project name so the LLM can disambiguate
    for (const m of msgs) {
      all.push({ ...m, text: `(from project "${p.name}") ${m.text}` });
    }
  }
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all.slice(-limit);
}

// Clear ALL message scopes (nuclear option for Settings)
export async function clearAllMessages(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const msgKeys = keys.filter(k => k.startsWith(KEYS.MSG_PREFIX) || k === KEYS.LEGACY_MESSAGES);
  if (msgKeys.length) await AsyncStorage.multiRemove(msgKeys);
}

// ───────────────────── Tasks ─────────────────────
export async function getTasks(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(KEYS.TASKS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveTask(task: Task): Promise<void> {
  const tasks = await getTasks();
  const idx = tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) tasks[idx] = task;
  else tasks.push(task);
  await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
}

export async function deleteTask(id: string): Promise<void> {
  const tasks = await getTasks();
  await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks.filter(t => t.id !== id)));
}

// ───────────────────── Custom agents ─────────────────────
export async function getCustomAgents(): Promise<SwarmAgent[]> {
  const raw = await AsyncStorage.getItem(KEYS.CUSTOM_AGENTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveCustomAgent(agent: SwarmAgent): Promise<void> {
  const agents = await getCustomAgents();
  const idx = agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) agents[idx] = agent;
  else agents.push(agent);
  await AsyncStorage.setItem(KEYS.CUSTOM_AGENTS, JSON.stringify(agents));
}

export async function deleteCustomAgent(id: string): Promise<void> {
  const agents = await getCustomAgents();
  await AsyncStorage.setItem(KEYS.CUSTOM_AGENTS, JSON.stringify(agents.filter(a => a.id !== id)));
}

// ───────────────────── Agent memory (key/value) ─────────────────────
export async function getAgentMemory(agentId: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(`${KEYS.AGENT_MEMORY}_${agentId}`);
  return raw ? JSON.parse(raw) : {};
}

export async function setAgentMemory(agentId: string, key: string, value: string): Promise<void> {
  const mem = await getAgentMemory(agentId);
  mem[key] = value;
  await AsyncStorage.setItem(`${KEYS.AGENT_MEMORY}_${agentId}`, JSON.stringify(mem));
}

// ───────────────────── Workflows ─────────────────────
export async function getWorkflows(): Promise<Workflow[]> {
  const raw = await AsyncStorage.getItem(KEYS.WORKFLOWS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const workflows = await getWorkflows();
  const idx = workflows.findIndex(w => w.id === workflow.id);
  if (idx >= 0) workflows[idx] = workflow;
  else workflows.push(workflow);
  await AsyncStorage.setItem(KEYS.WORKFLOWS, JSON.stringify(workflows));
}

export async function deleteWorkflow(id: string): Promise<void> {
  const workflows = await getWorkflows();
  await AsyncStorage.setItem(KEYS.WORKFLOWS, JSON.stringify(workflows.filter(w => w.id !== id)));
}

// ───────────────────── Command memory ─────────────────────
export async function getCommandMemory(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(KEYS.COMMAND_MEMORY);
  return raw ? JSON.parse(raw) : {};
}

export async function setCommandMemory(key: string, value: string): Promise<void> {
  const mem = await getCommandMemory();
  mem[key] = value;
  await AsyncStorage.setItem(KEYS.COMMAND_MEMORY, JSON.stringify(mem));
}

// ───────────────────── Settings ─────────────────────
export async function getSettings(): Promise<Record<string, any>> {
  const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
  return raw ? JSON.parse(raw) : { silentMode: false, focusedAgents: [], theme: 'dark' };
}

export async function updateSettings(updates: Record<string, any>): Promise<void> {
  const settings = await getSettings();
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...settings, ...updates }));
}

// ───────────────────── Projects ─────────────────────
export async function getProjects(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(KEYS.PROJECTS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveProject(project: Project): Promise<void> {
  const projects = await getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  await AsyncStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects));
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await getProjects();
  await AsyncStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects.filter(p => p.id !== id)));
  // Also wipe its messages
  await clearScope({ type: 'project', id });
}

export async function getActiveProjectId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.ACTIVE_PROJECT);
}

export async function setActiveProjectId(projectId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.ACTIVE_PROJECT, projectId);
}

// ───────────────────── Saved chats ─────────────────────
export async function getSavedChats(): Promise<SavedChat[]> {
  const raw = await AsyncStorage.getItem(KEYS.SAVED_CHATS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveChatSession(chat: SavedChat): Promise<void> {
  const chats = await getSavedChats();
  const idx = chats.findIndex(c => c.id === chat.id);
  if (idx >= 0) chats[idx] = chat;
  else chats.push(chat);
  await AsyncStorage.setItem(KEYS.SAVED_CHATS, JSON.stringify(chats));
}

export async function deleteSavedChat(id: string): Promise<void> {
  const chats = await getSavedChats();
  await AsyncStorage.setItem(KEYS.SAVED_CHATS, JSON.stringify(chats.filter(c => c.id !== id)));
}

// ───────────────────── External assets ─────────────────────
export async function getExternalAssets(): Promise<ExternalAsset[]> {
  const raw = await AsyncStorage.getItem(KEYS.EXTERNAL_ASSETS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveExternalAsset(asset: ExternalAsset): Promise<void> {
  const assets = await getExternalAssets();
  const idx = assets.findIndex(a => a.id === asset.id);
  if (idx >= 0) assets[idx] = asset;
  else assets.push(asset);
  await AsyncStorage.setItem(KEYS.EXTERNAL_ASSETS, JSON.stringify(assets));
}

export async function deleteExternalAsset(id: string): Promise<void> {
  const assets = await getExternalAssets();
  await AsyncStorage.setItem(KEYS.EXTERNAL_ASSETS, JSON.stringify(assets.filter(a => a.id !== id)));
}

// ───────────────────── API keys (multi-key, multi-provider) ─────────────────────
export type ApiProvider = 'openrouter' | 'ollama';

export interface ApiKey {
  id: string;
  provider: ApiProvider;
  label: string;
  // For openrouter: the API key. For ollama: base URL (e.g. http://localhost:11434).
  secret: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

export async function getApiKeys(provider?: ApiProvider): Promise<ApiKey[]> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  return provider ? all.filter(k => k.provider === provider) : all;
}

export async function saveApiKey(key: ApiKey): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(k => k.id === key.id);
  if (idx >= 0) all[idx] = key;
  else all.push(key);
  await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all));
}

export async function deleteApiKey(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all.filter(k => k.id !== id)));
}

export async function markApiKeyUsed(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  const k = all.find(x => x.id === id);
  if (k) {
    k.lastUsedAt = Date.now();
    await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all));
  }
}

// ───────────────────── Provider settings ─────────────────────
export interface ProviderSettings {
  defaultProvider: ApiProvider;  // which provider agents use by default
  defaultModel: string;          // model for openrouter (e.g. meta-llama/llama-3.1-8b-instruct:free)
  ollamaModel: string;           // model name for ollama (e.g. llama3.3)
}

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProvider: 'openrouter',
  defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
  ollamaModel: 'llama3.3',
};

export async function getProviderSettings(): Promise<ProviderSettings> {
  const raw = await AsyncStorage.getItem(KEYS.PROVIDER_SETTINGS);
  return raw ? { ...DEFAULT_PROVIDER_SETTINGS, ...JSON.parse(raw) } : DEFAULT_PROVIDER_SETTINGS;
}

export async function updateProviderSettings(updates: Partial<ProviderSettings>): Promise<void> {
  const current = await getProviderSettings();
  await AsyncStorage.setItem(KEYS.PROVIDER_SETTINGS, JSON.stringify({ ...current, ...updates }));
}
