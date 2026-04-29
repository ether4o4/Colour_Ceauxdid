import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  StatusBar, ScrollView, TextInput, Alert, Switch, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../utils/theme';
import {
  getSettings, updateSettings, clearAllMessages,
  getWorkflows, saveWorkflow, deleteWorkflow,
  getApiKeys, saveApiKey, deleteApiKey, ApiKey, ApiProvider,
  getProviderSettings, updateProviderSettings, ProviderSettings,
} from '../store';
import { testOpenRouterKey, testOllamaEndpoint } from '../utils/api';
import { DEFAULT_AGENTS } from '../agents/config';
import { Workflow } from '../types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// Popular OpenRouter models (free tier highlighted)
const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (free)' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)' },
  { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (free)' },
  { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (free)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (paid)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o (paid)' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (paid)' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (paid)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (paid)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (paid)' },
];

function maskSecret(s: string): string {
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return s.slice(0, 6) + '••••' + s.slice(-4);
}

export default function SettingsScreen() {
  const [silentMode, setSilentMode] = useState(false);
  const [focusedAgents, setFocusedAgents] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowCreate, setShowWorkflowCreate] = useState(false);
  const [workflowName, setWorkflowName] = useState('');

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [providerSettings, setProviderSettingsState] = useState<ProviderSettings>({
    defaultProvider: 'openrouter',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    ollamaModel: 'llama3.3',
  });

  // Add-key modal
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState<ApiProvider>('openrouter');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [testing, setTesting] = useState(false);

  // Model picker
  const [showModelPicker, setShowModelPicker] = useState(false);

  const loadAll = useCallback(async () => {
    const [settings, wfs, keys, provSettings] = await Promise.all([
      getSettings(), getWorkflows(), getApiKeys(), getProviderSettings(),
    ]);
    setSilentMode(settings.silentMode || false);
    setFocusedAgents(settings.focusedAgents || []);
    setWorkflows(wfs);
    setApiKeys(keys);
    setProviderSettingsState(provSettings);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function toggleSilentMode(val: boolean) {
    setSilentMode(val);
    await updateSettings({ silentMode: val });
  }

  async function toggleFocusAgent(id: string) {
    const next = focusedAgents.includes(id)
      ? focusedAgents.filter(a => a !== id)
      : [...focusedAgents, id];
    setFocusedAgents(next);
    await updateSettings({ focusedAgents: next });
  }

  function handleClearChat() {
    Alert.alert('Clear ALL chats', 'This deletes every 1-on-1 AND every group chat. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => { await clearAllMessages(); } },
    ]);
  }

  async function createWorkflow() {
    if (!workflowName.trim()) return;
    const wf: Workflow = {
      id: uuidv4(), name: workflowName.trim(), steps: [], createdAt: Date.now(),
    };
    await saveWorkflow(wf);
    await loadAll();
    setWorkflowName('');
    setShowWorkflowCreate(false);
  }

  async function handleDeleteWorkflow(id: string) { await deleteWorkflow(id); await loadAll(); }

  // ── API Keys ──
  function openAddKey() {
    setNewKeyProvider('openrouter');
    setNewKeyLabel('');
    setNewKeySecret('');
    setShowAddKeyModal(true);
  }

  async function handleSaveNewKey() {
    const secret = newKeySecret.trim();
    if (!secret) { Alert.alert('Missing', newKeyProvider === 'openrouter' ? 'Enter an API key' : 'Enter a base URL'); return; }

    setTesting(true);
    try {
      const res = newKeyProvider === 'openrouter'
        ? await testOpenRouterKey(secret)
        : await testOllamaEndpoint(secret);
      if (!res.ok) {
        Alert.alert('Key test failed', res.error || 'Unknown error');
        setTesting(false);
        return;
      }
      const key: ApiKey = {
        id: uuidv4(),
        provider: newKeyProvider,
        label: newKeyLabel.trim() || (newKeyProvider === 'openrouter' ? 'OpenRouter Key' : 'Ollama'),
        secret,
        isActive: true,
        createdAt: Date.now(),
      };
      await saveApiKey(key);
      await loadAll();
      setShowAddKeyModal(false);
      const okMsg = newKeyProvider === 'openrouter'
        ? `Key verified${res.label ? ` (${res.label})` : ''}${res.limit != null ? ` — limit $${res.limit}` : ''}. Saved.`
        : `Endpoint saved. ${(res.models || []).length} local models detected: ${(res.models || []).slice(0, 4).join(', ') || '(none yet)'}`;
      Alert.alert('Connected', okMsg);
    } finally {
      setTesting(false);
    }
  }

  function handleDeleteKey(k: ApiKey) {
    Alert.alert('Delete key?', `Remove "${k.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteApiKey(k.id); await loadAll(); } },
    ]);
  }

  async function toggleKeyActive(k: ApiKey) {
    await saveApiKey({ ...k, isActive: !k.isActive });
    await loadAll();
  }

  async function setDefaultProvider(p: ApiProvider) {
    await updateProviderSettings({ defaultProvider: p });
    await loadAll();
  }

  async function setDefaultModel(modelId: string) {
    await updateProviderSettings({ defaultModel: modelId });
    setShowModelPicker(false);
    await loadAll();
  }

  const openrouterKeys = apiKeys.filter(k => k.provider === 'openrouter');
  const ollamaKeys = apiKeys.filter(k => k.provider === 'ollama');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>SYSTEM SETTINGS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* API Keys */}
        <Section title="API KEYS & PROVIDERS">
          <View style={styles.providerPickRow}>
            {(['openrouter', 'ollama'] as ApiProvider[]).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setDefaultProvider(p)}
                style={[
                  styles.providerPick,
                  providerSettings.defaultProvider === p && styles.providerPickActive,
                ]}
                testID={`provider-pick-${p}`}
              >
                <Text style={[
                  styles.providerPickText,
                  providerSettings.defaultProvider === p && { color: COLORS.text },
                ]}>
                  {p === 'openrouter' ? 'OPENROUTER' : 'OLLAMA (LOCAL)'}
                </Text>
                {providerSettings.defaultProvider === p && <Text style={styles.providerPickCheck}>✓ ACTIVE</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hintText}>
            Active provider is used for all agent responses. Add multiple keys for the same provider — they'll be rotated round-robin so parallel agents don't collide on rate limits.
          </Text>

          {providerSettings.defaultProvider === 'openrouter' && (
            <TouchableOpacity style={styles.modelPickRow} onPress={() => setShowModelPicker(true)} testID="open-model-picker">
              <View>
                <Text style={styles.modelPickLabel}>DEFAULT MODEL</Text>
                <Text style={styles.modelPickValue}>{providerSettings.defaultModel}</Text>
              </View>
              <Text style={styles.modelPickChevron}>›</Text>
            </TouchableOpacity>
          )}

          {providerSettings.defaultProvider === 'ollama' && (
            <View style={styles.ollamaRow}>
              <Text style={styles.modelPickLabel}>OLLAMA MODEL</Text>
              <TextInput
                style={styles.input}
                value={providerSettings.ollamaModel}
                onChangeText={v => { setProviderSettingsState(s => ({ ...s, ollamaModel: v })); updateProviderSettings({ ollamaModel: v }); }}
                placeholder="llama3.3"
                placeholderTextColor={COLORS.muted}
              />
            </View>
          )}

          {/* OpenRouter keys list */}
          <Text style={styles.keyListTitle}>OPENROUTER KEYS ({openrouterKeys.length})</Text>
          {openrouterKeys.length === 0 ? (
            <Text style={styles.emptyText}>No OpenRouter keys yet</Text>
          ) : openrouterKeys.map(k => (
            <KeyRow key={k.id} k={k} onToggle={() => toggleKeyActive(k)} onDelete={() => handleDeleteKey(k)} />
          ))}

          {/* Ollama endpoints list */}
          <Text style={[styles.keyListTitle, { marginTop: 10 }]}>OLLAMA ENDPOINTS ({ollamaKeys.length})</Text>
          {ollamaKeys.length === 0 ? (
            <Text style={styles.emptyText}>No Ollama endpoints yet</Text>
          ) : ollamaKeys.map(k => (
            <KeyRow key={k.id} k={k} onToggle={() => toggleKeyActive(k)} onDelete={() => handleDeleteKey(k)} />
          ))}

          <TouchableOpacity style={styles.addKeyBtn} onPress={openAddKey} testID="add-api-key-button">
            <Text style={styles.addKeyText}>+ ADD API KEY / ENDPOINT</Text>
          </TouchableOpacity>
        </Section>

        {/* Silent Mode */}
        <Section title="SILENT MODE">
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Limit active agents</Text>
              <Text style={styles.rowSub}>Only focused agents will respond</Text>
            </View>
            <Switch
              value={silentMode}
              onValueChange={toggleSilentMode}
              trackColor={{ false: COLORS.border, true: COLORS.purple }}
              thumbColor={silentMode ? '#fff' : COLORS.muted}
            />
          </View>
        </Section>

        {silentMode && (
          <Section title="FOCUSED AGENTS">
            <View style={styles.chipRow}>
              {DEFAULT_AGENTS.map(agent => {
                const focused = focusedAgents.includes(agent.id);
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={[styles.chip, { borderColor: focused ? agent.colorHex : COLORS.border }]}
                    onPress={() => toggleFocusAgent(agent.id)}
                  >
                    <Text style={[styles.chipText, { color: focused ? agent.colorHex : COLORS.muted }]}>
                      {agent.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>
        )}

        {/* Workflows */}
        <Section title="SAVED WORKFLOWS">
          {workflows.length === 0 ? (
            <Text style={styles.emptyText}>No workflows saved</Text>
          ) : workflows.map(wf => (
            <View key={wf.id} style={styles.workflowRow}>
              <Text style={styles.workflowName}>{wf.name}</Text>
              <TouchableOpacity onPress={() => handleDeleteWorkflow(wf.id)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {showWorkflowCreate ? (
            <View style={styles.workflowCreate}>
              <TextInput
                style={styles.input}
                placeholder="Workflow name..."
                placeholderTextColor={COLORS.muted}
                value={workflowName}
                onChangeText={setWorkflowName}
              />
              <View style={styles.wfBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowWorkflowCreate(false)}>
                  <Text style={styles.cancelText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={createWorkflow}>
                  <Text style={styles.saveBtnText}>SAVE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addWorkflowBtn} onPress={() => setShowWorkflowCreate(true)}>
              <Text style={styles.addWorkflowText}>+ NEW WORKFLOW</Text>
            </TouchableOpacity>
          )}
        </Section>

        <Section title="SYSTEM">
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearChat}>
            <Text style={styles.dangerText}>CLEAR ALL MESSAGES</Text>
          </TouchableOpacity>
        </Section>

        <View style={styles.about}>
          <Text style={styles.aboutTitle}>COLOUR CEAUXDID</Text>
          <Text style={styles.aboutSub}>Multi-Agent AI Orchestration</Text>
          <Text style={styles.aboutSub}>v1.1.0 · Multi-provider BYOK</Text>
        </View>
      </ScrollView>

      {/* Add Key Modal */}
      <Modal visible={showAddKeyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>ADD API KEY / ENDPOINT</Text>

            <Text style={styles.fieldLabel}>PROVIDER</Text>
            <View style={styles.providerPickRow}>
              {(['openrouter', 'ollama'] as ApiProvider[]).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setNewKeyProvider(p)}
                  style={[styles.providerPick, newKeyProvider === p && styles.providerPickActive]}
                >
                  <Text style={[
                    styles.providerPickText,
                    newKeyProvider === p && { color: COLORS.text },
                  ]}>
                    {p === 'openrouter' ? 'OpenRouter' : 'Ollama'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>LABEL (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={newKeyProvider === 'openrouter' ? 'Personal OpenRouter, Work OpenRouter...' : 'Home Ollama, Lab server...'}
              placeholderTextColor={COLORS.muted}
              value={newKeyLabel}
              onChangeText={setNewKeyLabel}
            />

            <Text style={styles.fieldLabel}>
              {newKeyProvider === 'openrouter' ? 'API KEY' : 'BASE URL'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={newKeyProvider === 'openrouter' ? 'sk-or-v1-...' : 'http://localhost:11434'}
              placeholderTextColor={COLORS.muted}
              value={newKeySecret}
              onChangeText={setNewKeySecret}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={newKeyProvider === 'openrouter'}
              testID="new-key-secret"
            />
            <Text style={styles.hintText}>
              {newKeyProvider === 'openrouter'
                ? 'Get a key at openrouter.ai/keys. Stored locally on-device only — never leaves your phone.'
                : 'Point to any reachable Ollama server. Pull models first with `ollama pull llama3.3`.'}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowAddKeyModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleSaveNewKey}
                disabled={testing}
                testID="save-api-key-button"
              >
                {testing ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Test & Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Model Picker Modal */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>SELECT DEFAULT MODEL</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {OPENROUTER_MODELS.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.modelOption,
                    providerSettings.defaultModel === m.id && styles.modelOptionActive,
                  ]}
                  onPress={() => setDefaultModel(m.id)}
                >
                  <Text style={styles.modelOptionLabel}>{m.label}</Text>
                  <Text style={styles.modelOptionId}>{m.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalButton, { marginTop: 12 }]} onPress={() => setShowModelPicker(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function KeyRow({ k, onToggle, onDelete }: { k: ApiKey; onToggle: () => void; onDelete: () => void }) {
  return (
    <View style={styles.keyRow}>
      <View style={[styles.keyDot, { backgroundColor: k.isActive ? COLORS.green : COLORS.muted }]} />
      <View style={styles.keyBody}>
        <Text style={styles.keyLabel}>{k.label}</Text>
        <Text style={styles.keySecret}>
          {k.provider === 'openrouter' ? maskSecret(k.secret) : k.secret}
        </Text>
      </View>
      <Switch
        value={k.isActive}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.green }}
        thumbColor={k.isActive ? '#fff' : COLORS.muted}
      />
      <TouchableOpacity onPress={onDelete} style={{ paddingHorizontal: 8 }}>
        <Text style={styles.deleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  content: { padding: 12, paddingBottom: 60, gap: 16 },
  section: { gap: 8 },
  sectionTitle: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  sectionContent: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flex: 1 },
  rowLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: COLORS.surfaceElevated,
  },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  workflowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  workflowName: { color: COLORS.text, fontSize: 13 },
  deleteText: { color: COLORS.muted, fontSize: 16, padding: 4 },
  workflowCreate: { gap: 8 },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 14,
  },
  wfBtns: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  cancelText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.blue, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  addWorkflowBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center',
  },
  addWorkflowText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  dangerBtn: {
    borderWidth: 1, borderColor: COLORS.red + '60', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.red + '10',
  },
  dangerText: { color: COLORS.red, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  emptyText: { color: COLORS.muted, fontSize: 12 },
  about: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  aboutTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  aboutSub: { color: COLORS.muted, fontSize: 11, letterSpacing: 1 },

  // Providers
  providerPickRow: { flexDirection: 'row', gap: 8 },
  providerPick: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceElevated, alignItems: 'center',
  },
  providerPickActive: { borderColor: COLORS.highlight, backgroundColor: COLORS.highlight + '15' },
  providerPickText: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  providerPickCheck: { color: COLORS.highlight, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
  hintText: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },

  modelPickRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14,
  },
  modelPickLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  modelPickValue: { color: COLORS.text, fontSize: 13, marginTop: 2 },
  modelPickChevron: { color: COLORS.muted, fontSize: 20 },
  ollamaRow: { gap: 6 },

  keyListTitle: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  keyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
  },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyBody: { flex: 1 },
  keyLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  keySecret: { color: COLORS.muted, fontSize: 11, fontFamily: Platform.select ? undefined : 'monospace', marginTop: 2 },
  addKeyBtn: {
    borderWidth: 1, borderColor: COLORS.highlight + '60', borderRadius: 8, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center',
  },
  addKeyText: { color: COLORS.highlight, fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: COLORS.darkBg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 20, width: '90%', maxWidth: 480, gap: 10,
  },
  modalTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 6 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalButton: {
    flex: 1, paddingVertical: 11, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalButtonText: { color: COLORS.text, textAlign: 'center', fontWeight: '600' },
  primaryButton: { backgroundColor: COLORS.highlight, borderColor: COLORS.highlight },
  primaryButtonText: { color: '#000', textAlign: 'center', fontWeight: '700' },

  modelOption: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    padding: 12, marginBottom: 6, backgroundColor: COLORS.surfaceElevated,
  },
  modelOptionActive: { borderColor: COLORS.highlight, backgroundColor: COLORS.highlight + '10' },
  modelOptionLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  modelOptionId: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
});
