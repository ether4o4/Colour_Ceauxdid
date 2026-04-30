import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SwarmAgent, SwarmMessage, Task, Workflow, Project, SavedChat, ExternalAsset,
  UsageEntry, PinnedMemory,
} from '../types';
import { setSecret, getSecret, deleteSecret } from '../utils/secureStorage';

const KEYS = {
  LEGACY_MESSAGES: 'cc_messages',
  MSG_PREFIX: 'cc_msgs_',
  MIGRATION_DONE: 'cc_migration_v2_done',
  MIGRATION_SECURE: 'cc_migration_secure_done',
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
  USAGE_LEDGER: 'cc_usage_ledger',
  PINNED_MEMORIES: 'cc_pinned_memories',
};

// ───────────────────── Message scopes ─────────────────────
export type ChatScope =
  | { type: 'agent'; id: string }
  | { type: 'project'; id: string };

export function scopeKey(scope: ChatScope): string {
  return `${KEYS.MSG_PREFIX}${scope.type}_${scope.id}`;
}

async function runMigrationIfNeeded() {
  const done = await AsyncStorage.getItem(KEYS.MIGRATION_DONE);
  if (done === '1') return;
  const legacy = await AsyncStorage.getItem(KEYS.LEGACY_MESSAGES);
  if (legacy) {
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
  await AsyncStorage.setItem(key, JSON.stringify(arr.slice(-500)));
}

export async function updateMessage(msg: SwarmMessage, scope: ChatScope): Promise<void> {
  const key = scopeKey(scope);
  const raw = await AsyncStorage.getItem(key);
  const arr: SwarmMessage[] = raw ? JSON.parse(raw) : [];
  const idx = arr.findIndex(m => m.id === msg.id);
  if (idx >= 0) arr[idx] = msg; else arr.push(msg);
  await AsyncStorage.setItem(key, JSON.stringify(arr.slice(-500)));
}

export async function deleteMessage(messageId: string, scope: ChatScope): Promise<void> {
  const key = scopeKey(scope);
  const raw = await AsyncStorage.getItem(key);
  const arr: SwarmMessage[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(key, JSON.stringify(arr.filter(m => m.id !== messageId)));
}

export async function clearScope(scope: ChatScope): Promise<void> {
  await AsyncStorage.removeItem(scopeKey(scope));
}

export async function getGroupMessagesForAgent(agentId: string, limit = 40): Promise<SwarmMessage[]> {
  const projects = await getProjects();
  const relevantProjects = projects.filter(p => p.agents.includes(agentId));
  const all: SwarmMessage[] = [];
  for (const p of relevantProjects) {
    const msgs = await getMessages({ type: 'project', id: p.id });
    for (const m of msgs) {
      all.push({ ...m, text: `(from project "${p.name}") ${m.text}` });
    }
  }
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all.slice(-limit);
}

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
  if (idx >= 0) tasks[idx] = task; else tasks.push(task);
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
  if (idx >= 0) agents[idx] = agent; else agents.push(agent);
  await AsyncStorage.setItem(KEYS.CUSTOM_AGENTS, JSON.stringify(agents));
}
export async function deleteCustomAgent(id: string): Promise<void> {
  const agents = await getCustomAgents();
  await AsyncStorage.setItem(KEYS.CUSTOM_AGENTS, JSON.stringify(agents.filter(a => a.id !== id)));
}

// ───────────────────── Default-agent preferences (per-agent model/key pinning) ─────────────────────
// Core agents (Red/Blue/...) are not editable, but their model/key pinning lives here.
const KEY_CORE_PREFS = 'cc_core_agent_prefs';
export interface CoreAgentPrefs {
  [agentId: string]: {
    preferredProvider?: 'openrouter' | 'ollama';
    preferredModel?: string;
    preferredKeyId?: string;
  };
}
export async function getCoreAgentPrefs(): Promise<CoreAgentPrefs> {
  const raw = await AsyncStorage.getItem(KEY_CORE_PREFS);
  return raw ? JSON.parse(raw) : {};
}
export async function setCoreAgentPref(agentId: string, prefs: Partial<CoreAgentPrefs[string]>): Promise<void> {
  const all = await getCoreAgentPrefs();
  all[agentId] = { ...(all[agentId] || {}), ...prefs };
  await AsyncStorage.setItem(KEY_CORE_PREFS, JSON.stringify(all));
}

// ───────────────────── Agent key/value memory (legacy — kept for compat) ─────────────────────
export async function getAgentMemory(agentId: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(`${KEYS.AGENT_MEMORY}_${agentId}`);
  return raw ? JSON.parse(raw) : {};
}
export async function setAgentMemory(agentId: string, key: string, value: string): Promise<void> {
  const mem = await getAgentMemory(agentId);
  mem[key] = value;
  await AsyncStorage.setItem(`${KEYS.AGENT_MEMORY}_${agentId}`, JSON.stringify(mem));
}

// ───────────────────── Pinned memories (from chat actions menu) ─────────────────────
export async function getPinnedMemories(agentId?: string): Promise<PinnedMemory[]> {
  const raw = await AsyncStorage.getItem(KEYS.PINNED_MEMORIES);
  const all: PinnedMemory[] = raw ? JSON.parse(raw) : [];
  return agentId ? all.filter(m => m.agentId === agentId) : all;
}
export async function addPinnedMemory(mem: PinnedMemory): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.PINNED_MEMORIES);
  const all: PinnedMemory[] = raw ? JSON.parse(raw) : [];
  all.push(mem);
  await AsyncStorage.setItem(KEYS.PINNED_MEMORIES, JSON.stringify(all));
}
export async function removePinnedMemory(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.PINNED_MEMORIES);
  const all: PinnedMemory[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(KEYS.PINNED_MEMORIES, JSON.stringify(all.filter(m => m.id !== id)));
}

// ───────────────────── Workflows ─────────────────────
export async function getWorkflows(): Promise<Workflow[]> {
  const raw = await AsyncStorage.getItem(KEYS.WORKFLOWS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const workflows = await getWorkflows();
  const idx = workflows.findIndex(w => w.id === workflow.id);
  if (idx >= 0) workflows[idx] = workflow; else workflows.push(workflow);
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
  if (idx >= 0) projects[idx] = project; else projects.push(project);
  await AsyncStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects));
}
export async function deleteProject(id: string): Promise<void> {
  const projects = await getProjects();
  await AsyncStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects.filter(p => p.id !== id)));
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
  if (idx >= 0) chats[idx] = chat; else chats.push(chat);
  await AsyncStorage.setItem(KEYS.SAVED_CHATS, JSON.stringify(chats));
}
export async function deleteSavedChat(id: string): Promise<void> {
  const chats = await getSavedChats();
  await AsyncStorage.setItem(KEYS.SAVED_CHATS, JSON.stringify(chats.filter(c => c.id !== id)));
}

// ───────────────────── External assets (GitHub / Drive via PAT) ─────────────────────
export async function getExternalAssets(): Promise<ExternalAsset[]> {
  const raw = await AsyncStorage.getItem(KEYS.EXTERNAL_ASSETS);
  return raw ? JSON.parse(raw) : [];
}
export async function saveExternalAsset(asset: ExternalAsset): Promise<void> {
  const assets = await getExternalAssets();
  const idx = assets.findIndex(a => a.id === asset.id);
  if (idx >= 0) assets[idx] = asset; else assets.push(asset);
  await AsyncStorage.setItem(KEYS.EXTERNAL_ASSETS, JSON.stringify(assets));
}
export async function deleteExternalAsset(id: string): Promise<void> {
  const assets = await getExternalAssets();
  const a = assets.find(x => x.id === id);
  if (a?.secretKey) await deleteSecret(a.secretKey);
  await AsyncStorage.setItem(KEYS.EXTERNAL_ASSETS, JSON.stringify(assets.filter(a => a.id !== id)));
}
export async function getExternalAssetToken(secretKey: string): Promise<string | null> {
  return getSecret(secretKey);
}
export async function setExternalAssetToken(secretKey: string, token: string): Promise<void> {
  await setSecret(secretKey, token);
}

// ───────────────────── API keys (secure-store for secrets, AsyncStorage for metadata) ─────────────────────
export type ApiProvider = 'openrouter' | 'ollama';

export interface ApiKey {
  id: string;
  provider: ApiProvider;
  label: string;
  // DO NOT store the plaintext secret here in v1.2+. Instead the secret lives in
  // expo-secure-store under this secretKey. `secret` is populated on-demand by
  // resolveApiKeySecret() before use.
  secretKey: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

// Legacy shape: {...ApiKey, secret: string} all in AsyncStorage. Migration
// moves secrets into secure storage and wipes them from metadata on first read.
interface LegacyApiKey extends ApiKey { secret?: string; }

async function migrateApiKeysToSecure(): Promise<void> {
  const done = await AsyncStorage.getItem(KEYS.MIGRATION_SECURE);
  if (done === '1') return;
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  if (!raw) { await AsyncStorage.setItem(KEYS.MIGRATION_SECURE, '1'); return; }
  const all: LegacyApiKey[] = JSON.parse(raw);
  const migrated: ApiKey[] = [];
  for (const k of all) {
    const secretKey = k.secretKey || `apikey:${k.id}`;
    if (k.secret && !(await getSecret(secretKey))) {
      await setSecret(secretKey, k.secret);
    }
    migrated.push({
      id: k.id, provider: k.provider, label: k.label,
      secretKey, isActive: k.isActive, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt,
    });
  }
  await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(migrated));
  await AsyncStorage.setItem(KEYS.MIGRATION_SECURE, '1');
}

export async function getApiKeys(provider?: ApiProvider): Promise<ApiKey[]> {
  await migrateApiKeysToSecure();
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  return provider ? all.filter(k => k.provider === provider) : all;
}

export async function saveApiKey(key: ApiKey, plaintextSecret?: string): Promise<void> {
  await migrateApiKeysToSecure();
  if (plaintextSecret !== undefined && plaintextSecret !== '') {
    await setSecret(key.secretKey, plaintextSecret);
  }
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex(k => k.id === key.id);
  if (idx >= 0) all[idx] = key; else all.push(key);
  await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all));
}

export async function deleteApiKey(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  const k = all.find(x => x.id === id);
  if (k?.secretKey) await deleteSecret(k.secretKey);
  await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all.filter(k => k.id !== id)));
}

export async function markApiKeyUsed(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.API_KEYS);
  const all: ApiKey[] = raw ? JSON.parse(raw) : [];
  const k = all.find(x => x.id === id);
  if (k) { k.lastUsedAt = Date.now(); await AsyncStorage.setItem(KEYS.API_KEYS, JSON.stringify(all)); }
}

export async function resolveApiKeySecret(key: ApiKey): Promise<string> {
  return (await getSecret(key.secretKey)) || '';
}

// Previews last 4 chars for UI display. Secret itself never leaves secure store.
export async function getApiKeyPreview(key: ApiKey): Promise<string> {
  const secret = await getSecret(key.secretKey);
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return secret.slice(0, 6) + '••••' + secret.slice(-4);
}

// ───────────────────── Provider settings ─────────────────────
export interface ProviderSettings {
  defaultProvider: ApiProvider;
  defaultModel: string;
  ollamaModel: string;
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

// ───────────────────── Usage ledger (cost + tokens) ─────────────────────
const MAX_LEDGER = 5000;

export async function logUsage(entry: UsageEntry): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.USAGE_LEDGER);
  const all: UsageEntry[] = raw ? JSON.parse(raw) : [];
  all.push(entry);
  const trimmed = all.slice(-MAX_LEDGER);
  await AsyncStorage.setItem(KEYS.USAGE_LEDGER, JSON.stringify(trimmed));
}

export async function getUsageLedger(): Promise<UsageEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.USAGE_LEDGER);
  return raw ? JSON.parse(raw) : [];
}

export interface UsageStats {
  totalCostUsd: number;
  totalTokens: number;
  entryCount: number;
  byAgent: Record<string, { costUsd: number; tokens: number; count: number }>;
  byModel: Record<string, { costUsd: number; tokens: number; count: number }>;
}

export async function getUsageStats(opts?: { scopeKey?: string; sinceMs?: number }): Promise<UsageStats> {
  const ledger = await getUsageLedger();
  const since = opts?.sinceMs ?? 0;
  const filtered = ledger.filter(e =>
    e.timestamp >= since && (!opts?.scopeKey || e.scopeKey === opts.scopeKey)
  );
  const stats: UsageStats = {
    totalCostUsd: 0, totalTokens: 0, entryCount: filtered.length, byAgent: {}, byModel: {},
  };
  for (const e of filtered) {
    stats.totalCostUsd += e.costUsd || 0;
    stats.totalTokens += e.totalTokens || 0;
    const a = (stats.byAgent[e.agentId] ||= { costUsd: 0, tokens: 0, count: 0 });
    a.costUsd += e.costUsd || 0; a.tokens += e.totalTokens || 0; a.count++;
    const m = (stats.byModel[e.model] ||= { costUsd: 0, tokens: 0, count: 0 });
    m.costUsd += e.costUsd || 0; m.tokens += e.totalTokens || 0; m.count++;
  }
  return stats;
}

export async function clearUsageLedger(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.USAGE_LEDGER);
}

// ───────────────────── Backup / restore (JSON export/import) ─────────────────────
// Intentionally excludes raw secrets — user must re-paste keys after import for security.
const EXPORTABLE_KEYS = [
  KEYS.TASKS, KEYS.WORKFLOWS, KEYS.CUSTOM_AGENTS, KEYS.COMMAND_MEMORY,
  KEYS.SETTINGS, KEYS.PROJECTS, KEYS.SAVED_CHATS, KEYS.EXTERNAL_ASSETS,
  KEYS.API_KEYS, KEYS.PROVIDER_SETTINGS, KEYS.USAGE_LEDGER, KEYS.PINNED_MEMORIES,
  KEY_CORE_PREFS,
];

export async function exportAll(): Promise<string> {
  const asyncKeys = await AsyncStorage.getAllKeys();
  const selected = asyncKeys.filter(k =>
    EXPORTABLE_KEYS.includes(k) || k.startsWith(KEYS.MSG_PREFIX) || k.startsWith(KEYS.AGENT_MEMORY),
  );
  const pairs = await AsyncStorage.multiGet(selected);
  const data: Record<string, unknown> = {};
  for (const [k, v] of pairs) if (v != null) data[k] = JSON.parse(v);
  return JSON.stringify({
    app: 'colour-ceauxdid',
    version: 1,
    exportedAt: Date.now(),
    note: 'API keys & OAuth tokens are NOT included — re-paste them after import.',
    data,
  }, null, 2);
}

export async function importAll(jsonString: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || parsed.app !== 'colour-ceauxdid') {
    throw new Error('Not a Colour Ceauxdid backup file.');
  }
  const data = parsed.data || {};
  const writes: [string, string][] = [];
  for (const [k, v] of Object.entries(data)) {
    writes.push([k, JSON.stringify(v)]);
  }
  if (writes.length) await AsyncStorage.multiSet(writes);
  return { imported: writes.length };
}
