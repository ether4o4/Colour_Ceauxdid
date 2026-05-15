import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  StatusBar, ScrollView, TextInput, Switch, Modal, ActivityIndicator, Share,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../utils/theme';
import {
  getSettings, updateSettings, clearAllMessages,
  getWorkflows, saveWorkflow, deleteWorkflow,
  getApiKeys, saveApiKey, deleteApiKey, getApiKeyPreview, ApiKey, ApiProvider,
  getProviderSettings, updateProviderSettings, ProviderSettings,
  getUsageStats, clearUsageLedger,
  getExternalAssets, deleteExternalAsset,
  exportAll, importAll,
  getCoreAgentPrefs, setCoreAgentPref,
} from '../store';
import {
  testOpenRouterKey, testOllamaEndpoint, listOpenRouterModels,
} from '../utils/api';
import { testGitHubToken, testGoogleDriveToken, createExternalAsset } from '../utils/integrations';
import { saveExternalAsset } from '../store';
import { DEFAULT_AGENTS } from '../agents/config';
import { Workflow, WorkflowStep, ExternalAsset } from '../types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const QUICK_MODELS = [
  // Free tier (verified available 2026)
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
  { id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek V3.1 (free)' },
  { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 reasoning (free)' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', label: 'Hermes 3 405B (free)' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B (free)' },
  // Paid but popular
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (paid)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o (paid)' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (paid)' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (paid)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (paid)' },
];

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

export default function SettingsScreen() {
  const [silentMode, setSilentMode] = useState(false);
  const [focusedAgents, setFocusedAgents] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keyPreviews, setKeyPreviews] = useState<Record<string, string>>({});
  const [providerSettings, setProviderSettingsState] = useState<ProviderSettings>({
    defaultProvider: 'openrouter',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    ollamaModel: 'llama3.3',
  });
  const [assets, setAssets] = useState<ExternalAsset[]>([]);
  const [usageTotals, setUsageTotals] = useState({ cost: 0, tokens: 0, entries: 0 });
  const [corePrefs, setCorePrefsState] = useState<Record<string, { preferredModel?: string; preferredKeyId?: string }>>({});

  // ── Modals ──
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState<ApiProvider>('openrouter');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeySecret, setNewKeySecret] = useState('');
  const [newKeyError, setNewKeyError] = useState('');
  const [testing, setTesting] = useState(false);

  const [showModelPicker, setShowModelPicker] = useState(false);
  const [dynModels, setDynModels] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');

  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [wfName, setWfName] = useState('');
  const [wfSteps, setWfSteps] = useState<WorkflowStep[]>([]);
  const [wfError, setWfError] = useState('');

  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetType, setAssetType] = useState<ExternalAsset['type']>('github');
  const [assetLabel, setAssetLabel] = useState('');
  const [assetToken, setAssetToken] = useState('');
  const [assetError, setAssetError] = useState('');
  const [assetTesting, setAssetTesting] = useState(false);

  const [showAgentPin, setShowAgentPin] = useState<string | null>(null); // agentId

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const loadAll = useCallback(async () => {
    const [settings, wfs, keys, provSettings, assetList, usage, prefs] = await Promise.all([
      getSettings(), getWorkflows(), getApiKeys(), getProviderSettings(),
      getExternalAssets(),
      getUsageStats({ sinceMs: Date.now() - MS_30_DAYS }),
      getCoreAgentPrefs(),
    ]);
    setSilentMode(settings.silentMode || false);
    setFocusedAgents(settings.focusedAgents || []);
    setWorkflows(wfs);
    setApiKeys(keys);
    setProviderSettingsState(provSettings);
    setAssets(assetList);
    setUsageTotals({ cost: usage.totalCostUsd, tokens: usage.totalTokens, entries: usage.entryCount });
    setCorePrefsState(prefs);

    // load masked previews
    const prevs: Record<string, string> = {};
    for (const k of keys) prevs[k.id] = await getApiKeyPreview(k);
    setKeyPreviews(prevs);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function toggleSilentMode(val: boolean) {
    setSilentMode(val);
    await updateSettings({ silentMode: val });
  }

  async function toggleFocusAgent(id: string) {
    const next = focusedAgents.includes(id) ? focusedAgents.filter(a => a !== id) : [...focusedAgents, id];
    setFocusedAgents(next);
    await updateSettings({ focusedAgents: next });
  }

  // ── API Keys ──
  function openAddKey() {
    setNewKeyProvider('openrouter');
    setNewKeyLabel('');
    setNewKeySecret('');
    setNewKeyError('');
    setShowAddKey(true);
  }

  async function handleSaveNewKey() {
    const secret = newKeySecret.trim();
    if (!secret) {
      setNewKeyError(newKeyProvider === 'openrouter' ? 'Enter an API key' : 'Enter a base URL');
      return;
    }
    setTesting(true);
    setNewKeyError('');
    const res = newKeyProvider === 'openrouter'
      ? await testOpenRouterKey(secret)
      : await testOllamaEndpoint(secret);
    if (!res.ok) {
      setNewKeyError(res.error || 'Validation failed');
      setTesting(false);
      return;
    }
    const id = uuidv4();
    const key: ApiKey = {
      id, provider: newKeyProvider,
      label: newKeyLabel.trim() || (newKeyProvider === 'openrouter' ? 'OpenRouter Key' : 'Ollama'),
      secretKey: `apikey:${id}`,
      isActive: true, createdAt: Date.now(),
    };
    await saveApiKey(key, secret);
    setTesting(false);
    setShowAddKey(false);
    await loadAll();
  }

  async function handleDeleteKey(k: ApiKey) {
    await deleteApiKey(k.id);
    await loadAll();
  }

  async function toggleKeyActive(k: ApiKey) {
    await saveApiKey({ ...k, isActive: !k.isActive });
    await loadAll();
  }

  async function setDefaultProvider(p: ApiProvider) {
    await updateProviderSettings({ defaultProvider: p });
    await loadAll();
  }

  async function openModelPicker() {
    // Try to pull live models using the first active OpenRouter key
    const orKey = apiKeys.find(k => k.provider === 'openrouter' && k.isActive);
    if (orKey) {
      const { resolveApiKeySecret } = await import('../store');
      const secret = await resolveApiKeySecret(orKey);
      const models = await listOpenRouterModels(secret);
      setDynModels(models.map(m => m.id).sort());
    } else {
      setDynModels([]);
    }
    setShowModelPicker(true);
  }

  async function pickModel(modelId: string) {
    await updateProviderSettings({ defaultModel: modelId });
    setShowModelPicker(false);
    await loadAll();
  }

  // ── Workflows ──
  function openWorkflowModal() {
    setWfName(''); setWfSteps([]); setWfError('');
    setShowWorkflowModal(true);
  }
  function addWfStep() {
    setWfSteps(s => [...s, { id: uuidv4(), agentId: 'red', instruction: '' }]);
  }
  function updateWfStep(i: number, patch: Partial<WorkflowStep>) {
    setWfSteps(s => s.map((step, idx) => idx === i ? { ...step, ...patch } : step));
  }
  function removeWfStep(i: number) { setWfSteps(s => s.filter((_, idx) => idx !== i)); }
  async function saveWf() {
    if (!wfName.trim()) { setWfError('Name required'); return; }
    if (wfSteps.length === 0) { setWfError('Add at least one step'); return; }
    if (wfSteps.some(s => !s.instruction.trim())) { setWfError('All steps need an instruction'); return; }
    const wf: Workflow = {
      id: uuidv4(), name: wfName.trim(), steps: wfSteps, createdAt: Date.now(),
    };
    await saveWorkflow(wf);
    setShowWorkflowModal(false);
    await loadAll();
  }

  // ── Assets ──
  function openAddAsset() {
    setAssetType('github'); setAssetLabel(''); setAssetToken(''); setAssetError('');
    setShowAddAsset(true);
  }
  async function saveAsset() {
    if (!assetToken.trim()) { setAssetError('Token required'); return; }
    setAssetTesting(true); setAssetError('');
    let ref: string | undefined;
    if (assetType === 'github') {
      const r = await testGitHubToken(assetToken.trim());
      if (!r.ok) { setAssetError(r.error || 'Invalid token'); setAssetTesting(false); return; }
      ref = r.login;
    } else if (assetType === 'gdrive') {
      const r = await testGoogleDriveToken(assetToken.trim());
      if (!r.ok) { setAssetError(r.error || 'Invalid token'); setAssetTesting(false); return; }
      ref = r.userEmail;
    }
    const label = assetLabel.trim() || (ref || assetType.toUpperCase());
    const asset = await createExternalAsset(assetType, label, assetToken.trim(), ref);
    await saveExternalAsset(asset);
    setAssetTesting(false); setShowAddAsset(false);
    await loadAll();
  }

  // ── Cost ledger ──
  async function handleClearUsage() {
    await clearUsageLedger();
    await loadAll();
  }

  // ── Export / Import ──
  async function handleExport() {
    const json = await exportAll();
    if (Platform.OS === 'web') {
      try { await Clipboard.setStringAsync(json); } catch {}
      // Also try download-as-file on web
      try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `colour-ceauxdid-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(url);
      } catch {}
    } else {
      try { await Share.share({ message: json, title: 'Colour Ceauxdid backup' }); } catch {}
    }
  }

  async function handleImportSubmit() {
    setImportError(''); setImportSuccess('');
    try {
      const res = await importAll(importText);
      setImportSuccess(`Imported ${res.imported} keys. Reopening…`);
      setImportText('');
      setTimeout(() => { setShowImport(false); loadAll(); }, 1000);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
    }
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

        {/* Cost ledger */}
        <Section title="USAGE · LAST 30 DAYS">
          <View style={styles.statRow}>
            <Stat label="Cost" value={`$${usageTotals.cost.toFixed(4)}`} />
            <Stat label="Tokens" value={usageTotals.tokens.toLocaleString()} color={COLORS.green} />
            <Stat label="Calls" value={`${usageTotals.entries}`} color={COLORS.blue} />
          </View>
          {usageTotals.entries > 0 && (
            <TouchableOpacity style={styles.dangerLightBtn} onPress={handleClearUsage}>
              <Text style={styles.dangerLightText}>RESET LEDGER</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* API Keys */}
        <Section title="API KEYS & PROVIDERS">
          <View style={styles.providerPickRow}>
            {(['openrouter', 'ollama'] as ApiProvider[]).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setDefaultProvider(p)}
                style={[styles.providerPick, providerSettings.defaultProvider === p && styles.providerPickActive]}
                testID={`provider-pick-${p}`}
              >
                <Text style={[styles.providerPickText, providerSettings.defaultProvider === p && { color: COLORS.text }]}>
                  {p === 'openrouter' ? 'OPENROUTER' : 'OLLAMA (LOCAL)'}
                </Text>
                {providerSettings.defaultProvider === p && <Text style={styles.providerPickCheck}>✓ ACTIVE</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hintText}>
            Secrets are stored in the OS keychain on mobile and obfuscated in browser storage on web. Multiple keys per provider rotate automatically for parallel agent calls.
          </Text>

          {providerSettings.defaultProvider === 'openrouter' && (
            <TouchableOpacity style={styles.modelPickRow} onPress={openModelPicker} testID="open-model-picker">
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

          <Text style={styles.keyListTitle}>OPENROUTER KEYS ({openrouterKeys.length})</Text>
          {openrouterKeys.length === 0 ? <Text style={styles.emptyText}>No keys yet</Text> : openrouterKeys.map(k => (
            <KeyRow key={k.id} k={k} preview={keyPreviews[k.id] || ''} onToggle={() => toggleKeyActive(k)} onDelete={() => handleDeleteKey(k)} />
          ))}

          <Text style={[styles.keyListTitle, { marginTop: 10 }]}>OLLAMA ENDPOINTS ({ollamaKeys.length})</Text>
          {ollamaKeys.length === 0 ? <Text style={styles.emptyText}>No endpoints yet</Text> : ollamaKeys.map(k => (
            <KeyRow key={k.id} k={k} preview={keyPreviews[k.id] || k.label} onToggle={() => toggleKeyActive(k)} onDelete={() => handleDeleteKey(k)} />
          ))}

          <TouchableOpacity style={styles.addKeyBtn} onPress={openAddKey} testID="add-api-key-button">
            <Text style={styles.addKeyText}>+ ADD API KEY / ENDPOINT</Text>
          </TouchableOpacity>
        </Section>

        {/* Per-agent model/key pinning */}
        <Section title="PER-AGENT MODEL PINNING">
          <Text style={styles.hintText}>
            Pin a specific model per agent (e.g. cheap Llama for Yellow's brainstorms, best model for Blue's reasoning). Agents without a pin use the default above.
          </Text>
          {DEFAULT_AGENTS.map(agent => {
            const pinnedModel = corePrefs[agent.id]?.preferredModel;
            const pinnedKey = corePrefs[agent.id]?.preferredKeyId
              ? apiKeys.find(k => k.id === corePrefs[agent.id]?.preferredKeyId)?.label
              : null;
            return (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentPinRow, { borderLeftColor: agent.colorHex }]}
                onPress={() => setShowAgentPin(agent.id)}
              >
                <View style={[styles.colorDotSmall, { backgroundColor: agent.colorHex }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pinAgentName, { color: agent.colorHex }]}>{agent.name.toUpperCase()}</Text>
                  <Text style={styles.pinValueText}>
                    {pinnedModel || 'Default'} {pinnedKey ? `· key: ${pinnedKey}` : ''}
                  </Text>
                </View>
                <Text style={styles.modelPickChevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </Section>

        {/* Integrations */}
        <Section title="EXTERNAL INTEGRATIONS">
          <Text style={styles.hintText}>
            Connect GitHub (Personal Access Token) and Google Drive (OAuth access token). Tokens stored in the OS keychain on mobile / obfuscated on web.
          </Text>
          {assets.length === 0 ? (
            <Text style={styles.emptyText}>No integrations connected</Text>
          ) : assets.map(a => (
            <View key={a.id} style={styles.assetRow}>
              <Text style={styles.assetIcon}>{a.type === 'github' ? '🐙' : a.type === 'gdrive' ? '📁' : '🔗'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetLabel}>{a.label}</Text>
                <Text style={styles.assetRef}>{a.accountRef || a.type.toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteExternalAsset(a.id).then(loadAll)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addKeyBtn} onPress={openAddAsset}>
            <Text style={styles.addKeyText}>+ CONNECT INTEGRATION</Text>
          </TouchableOpacity>
        </Section>

        {/* Silent Mode */}
        <Section title="SILENT MODE">
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Limit active agents</Text>
              <Text style={styles.rowSub}>Only focused agents will respond</Text>
            </View>
            <Switch value={silentMode} onValueChange={toggleSilentMode}
              trackColor={{ false: COLORS.border, true: COLORS.purple }}
              thumbColor={silentMode ? '#fff' : COLORS.muted} />
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
        <Section title="WORKFLOWS">
          {workflows.length === 0 ? (
            <Text style={styles.emptyText}>No workflows saved</Text>
          ) : workflows.map(wf => (
            <View key={wf.id} style={styles.workflowCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.workflowName}>{wf.name}</Text>
                <Text style={styles.workflowSteps}>{wf.steps.length} step{wf.steps.length === 1 ? '' : 's'}</Text>
                {wf.steps.slice(0, 3).map((s, i) => {
                  const agent = DEFAULT_AGENTS.find(a => a.id === s.agentId);
                  return (
                    <Text key={s.id} style={styles.workflowStepLine}>
                      <Text style={{ color: agent?.colorHex || COLORS.muted, fontWeight: '700' }}>
                        {i + 1}. {agent?.name || s.agentId}
                      </Text>
                      {': '}
                      <Text style={{ color: COLORS.muted }}>{s.instruction.slice(0, 80)}</Text>
                    </Text>
                  );
                })}
                {wf.steps.length > 3 && <Text style={styles.workflowStepLine}>… +{wf.steps.length - 3} more</Text>}
              </View>
              <TouchableOpacity onPress={() => deleteWorkflow(wf.id).then(loadAll)}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addWorkflowBtn} onPress={openWorkflowModal}>
            <Text style={styles.addWorkflowText}>+ NEW WORKFLOW</Text>
          </TouchableOpacity>
        </Section>

        {/* Backup */}
        <Section title="BACKUP & RESTORE">
          <Text style={styles.hintText}>
            Exports everything except API secrets. Keys must be re-added after import for security.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={handleExport}>
              <Text style={styles.secondaryBtnText}>EXPORT JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => { setImportText(''); setImportError(''); setImportSuccess(''); setShowImport(true); }}>
              <Text style={styles.secondaryBtnText}>IMPORT JSON</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="SYSTEM">
          <TouchableOpacity style={styles.dangerBtn} onPress={async () => { await clearAllMessages(); await loadAll(); }}>
            <Text style={styles.dangerText}>CLEAR ALL MESSAGES</Text>
          </TouchableOpacity>
        </Section>

        <View style={styles.about}>
          <Text style={styles.aboutTitle}>COLOUR CEAUXDID</Text>
          <Text style={styles.aboutSub}>Multi-Agent AI Orchestration</Text>
          <Text style={styles.aboutSub}>v2.0 · Secure + Multi-key + Routing</Text>
        </View>
      </ScrollView>

      {/* Add API Key Modal (inline errors) */}
      <Modal visible={showAddKey} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>ADD API KEY / ENDPOINT</Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>PROVIDER</Text>
              <View style={styles.providerPickRow}>
                {(['openrouter', 'ollama'] as ApiProvider[]).map(p => (
                  <TouchableOpacity key={p} onPress={() => setNewKeyProvider(p)}
                    style={[styles.providerPick, newKeyProvider === p && styles.providerPickActive]}>
                    <Text style={[styles.providerPickText, newKeyProvider === p && { color: COLORS.text }]}>
                      {p === 'openrouter' ? 'OpenRouter' : 'Ollama'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>LABEL (optional)</Text>
              <TextInput style={styles.input}
                placeholder={newKeyProvider === 'openrouter' ? 'Personal OpenRouter…' : 'Home Ollama…'}
                placeholderTextColor={COLORS.muted}
                value={newKeyLabel} onChangeText={setNewKeyLabel} />
              <Text style={styles.fieldLabel}>{newKeyProvider === 'openrouter' ? 'API KEY' : 'BASE URL'}</Text>
              <TextInput style={styles.input}
                placeholder={newKeyProvider === 'openrouter' ? 'sk-or-v1-…' : 'http://localhost:11434'}
                placeholderTextColor={COLORS.muted}
                value={newKeySecret}
                onChangeText={v => { setNewKeySecret(v); if (newKeyError) setNewKeyError(''); }}
                autoCapitalize="none" autoCorrect={false}
                secureTextEntry={newKeyProvider === 'openrouter'}
                testID="new-key-secret" />
              {newKeyError ? <Text style={styles.inlineError}>{newKeyError}</Text> : null}
              <Text style={styles.hintText}>
                {newKeyProvider === 'openrouter'
                  ? 'Get a key at openrouter.ai/keys. Stored in device keychain — never leaves your device.'
                  : 'Point to any reachable Ollama server. Pull models first with `ollama pull llama3.3`.'}
              </Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.secondaryBtn]} onPress={() => setShowAddKey(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]}
                onPress={handleSaveNewKey} disabled={testing} testID="save-api-key-button">
                {testing ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Test & Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Model Picker */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>SELECT MODEL</Text>
            <TextInput
              style={styles.input}
              placeholder="Search models (e.g. 'llama', ':free', 'claude')"
              placeholderTextColor={COLORS.muted}
              value={modelSearch}
              onChangeText={setModelSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {modelSearch.trim() === '' && (
                <>
                  <Text style={styles.fieldLabel}>POPULAR</Text>
                  {QUICK_MODELS.map(m => (
                    <TouchableOpacity key={m.id}
                      style={[styles.modelOption, providerSettings.defaultModel === m.id && styles.modelOptionActive]}
                      onPress={() => pickModel(m.id)}>
                      <Text style={styles.modelOptionLabel}>{m.label}</Text>
                      <Text style={styles.modelOptionId}>{m.id}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {dynModels.length > 0 && (() => {
                const q = modelSearch.trim().toLowerCase();
                const filtered = q ? dynModels.filter(m => m.toLowerCase().includes(q)) : dynModels;
                // Free models first when not searching
                const sorted = q ? filtered : [
                  ...filtered.filter(m => m.endsWith(':free')),
                  ...filtered.filter(m => !m.endsWith(':free')),
                ];
                return (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: q ? 0 : 12 }]}>
                      {q ? `MATCHES (${filtered.length} / ${dynModels.length})` : `ALL (${dynModels.length}) — LIVE FROM OPENROUTER`}
                    </Text>
                    {sorted.length === 0 && <Text style={styles.emptyText}>No models match "{modelSearch}"</Text>}
                    {sorted.map(m => (
                      <TouchableOpacity key={m}
                        style={[styles.modelOptionCompact, providerSettings.defaultModel === m && styles.modelOptionActive]}
                        onPress={() => pickModel(m)}>
                        <Text style={styles.modelOptionId}>{m}{m.endsWith(':free') ? '  ·  FREE' : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                );
              })()}
            </ScrollView>
            <TouchableOpacity style={[styles.modalButton, styles.primaryButton, { marginTop: 12 }]} onPress={() => { setModelSearch(''); setShowModelPicker(false); }}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Workflow Editor */}
      <Modal visible={showWorkflowModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NEW WORKFLOW</Text>
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput style={styles.input}
                placeholder="e.g. Plan → Build → Review"
                placeholderTextColor={COLORS.muted}
                value={wfName} onChangeText={setWfName} />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>STEPS ({wfSteps.length})</Text>
              {wfSteps.map((step, i) => {
                const agent = DEFAULT_AGENTS.find(a => a.id === step.agentId);
                return (
                  <View key={step.id} style={[styles.wfStepCard, { borderLeftColor: agent?.colorHex }]}>
                    <View style={styles.wfStepHead}>
                      <Text style={styles.wfStepNum}>#{i + 1}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {DEFAULT_AGENTS.map(a => (
                            <TouchableOpacity key={a.id}
                              style={[
                                styles.wfAgentChip,
                                { borderColor: step.agentId === a.id ? a.colorHex : COLORS.border },
                                step.agentId === a.id && { backgroundColor: a.colorHex + '20' },
                              ]}
                              onPress={() => updateWfStep(i, { agentId: a.id })}>
                              <Text style={[styles.wfAgentChipText, { color: step.agentId === a.id ? a.colorHex : COLORS.muted }]}>
                                {a.name[0]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <TouchableOpacity onPress={() => removeWfStep(i)}>
                        <Text style={styles.deleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput style={styles.input}
                      placeholder="Instruction for this step..."
                      placeholderTextColor={COLORS.muted}
                      value={step.instruction}
                      onChangeText={v => updateWfStep(i, { instruction: v })}
                      multiline />
                  </View>
                );
              })}
              <TouchableOpacity style={styles.addStepBtn} onPress={addWfStep}>
                <Text style={styles.addStepText}>+ ADD STEP</Text>
              </TouchableOpacity>

              {wfError ? <Text style={styles.inlineError}>{wfError}</Text> : null}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.secondaryBtn]} onPress={() => setShowWorkflowModal(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={saveWf}>
                <Text style={styles.primaryButtonText}>Save Workflow</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Asset */}
      <Modal visible={showAddAsset} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>CONNECT INTEGRATION</Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>TYPE</Text>
              <View style={styles.providerPickRow}>
                {(['github', 'gdrive'] as ExternalAsset['type'][]).map(t => (
                  <TouchableOpacity key={t} onPress={() => setAssetType(t)}
                    style={[styles.providerPick, assetType === t && styles.providerPickActive]}>
                    <Text style={[styles.providerPickText, assetType === t && { color: COLORS.text }]}>
                      {t === 'github' ? 'GITHUB' : 'GOOGLE DRIVE'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>LABEL (optional)</Text>
              <TextInput style={styles.input}
                placeholder="Personal, Work, etc."
                placeholderTextColor={COLORS.muted}
                value={assetLabel} onChangeText={setAssetLabel} />
              <Text style={styles.fieldLabel}>
                {assetType === 'github' ? 'PERSONAL ACCESS TOKEN' : 'OAUTH ACCESS TOKEN'}
              </Text>
              <TextInput style={styles.input}
                placeholder={assetType === 'github' ? 'ghp_... or github_pat_...' : 'ya29....'}
                placeholderTextColor={COLORS.muted}
                value={assetToken}
                onChangeText={v => { setAssetToken(v); if (assetError) setAssetError(''); }}
                autoCapitalize="none" autoCorrect={false} secureTextEntry />
              {assetError ? <Text style={styles.inlineError}>{assetError}</Text> : null}
              <Text style={styles.hintText}>
                {assetType === 'github'
                  ? 'Create at github.com/settings/tokens with "repo" scope. Token saved securely on-device.'
                  : 'Get a short-lived access token at developers.google.com/oauthplayground (Drive API readonly scope). Expires ~1 hour.'}
              </Text>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.secondaryBtn]} onPress={() => setShowAddAsset(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]}
                onPress={saveAsset} disabled={assetTesting}>
                {assetTesting ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Test & Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Per-agent model pin */}
      <Modal visible={!!showAgentPin} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            {showAgentPin && (() => {
              const ag = DEFAULT_AGENTS.find(a => a.id === showAgentPin)!;
              const mine = corePrefs[ag.id] || {};
              return (
                <>
                  <Text style={[styles.modalTitle, { color: ag.colorHex }]}>PIN FOR {ag.name.toUpperCase()}</Text>
                  <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
                    <Text style={styles.fieldLabel}>MODEL</Text>
                    <TouchableOpacity
                      style={[styles.modelOption, !mine.preferredModel && styles.modelOptionActive]}
                      onPress={async () => { await setCoreAgentPref(ag.id, { preferredModel: undefined }); await loadAll(); }}>
                      <Text style={styles.modelOptionLabel}>Use default</Text>
                      <Text style={styles.modelOptionId}>Follow the global default model</Text>
                    </TouchableOpacity>
                    {QUICK_MODELS.map(m => (
                      <TouchableOpacity key={m.id}
                        style={[styles.modelOption, mine.preferredModel === m.id && styles.modelOptionActive]}
                        onPress={async () => { await setCoreAgentPref(ag.id, { preferredModel: m.id }); await loadAll(); }}>
                        <Text style={styles.modelOptionLabel}>{m.label}</Text>
                        <Text style={styles.modelOptionId}>{m.id}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>API KEY</Text>
                    <TouchableOpacity
                      style={[styles.modelOption, !mine.preferredKeyId && styles.modelOptionActive]}
                      onPress={async () => { await setCoreAgentPref(ag.id, { preferredKeyId: undefined }); await loadAll(); }}>
                      <Text style={styles.modelOptionLabel}>Round-robin (default)</Text>
                    </TouchableOpacity>
                    {apiKeys.filter(k => k.provider === 'openrouter').map(k => (
                      <TouchableOpacity key={k.id}
                        style={[styles.modelOption, mine.preferredKeyId === k.id && styles.modelOptionActive]}
                        onPress={async () => { await setCoreAgentPref(ag.id, { preferredKeyId: k.id }); await loadAll(); }}>
                        <Text style={styles.modelOptionLabel}>{k.label}</Text>
                        <Text style={styles.modelOptionId}>{keyPreviews[k.id] || ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={[styles.modalButton, styles.primaryButton, { marginTop: 12 }]} onPress={() => setShowAgentPin(null)} testID="pin-done-button">
                    <Text style={styles.primaryButtonText}>Done</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Import */}
      <Modal visible={showImport} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>IMPORT BACKUP JSON</Text>
            <TextInput
              style={[styles.input, { minHeight: 160, textAlignVertical: 'top' }]}
              placeholder="Paste exported JSON here..."
              placeholderTextColor={COLORS.muted}
              multiline
              value={importText}
              onChangeText={v => { setImportText(v); if (importError) setImportError(''); }}
            />
            {importError ? <Text style={styles.inlineError}>{importError}</Text> : null}
            {importSuccess ? <Text style={styles.inlineSuccess}>{importSuccess}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.secondaryBtn]} onPress={() => setShowImport(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleImportSubmit}>
                <Text style={styles.primaryButtonText}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function KeyRow({ k, preview, onToggle, onDelete }: {
  k: ApiKey; preview: string; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <View style={styles.keyRow}>
      <View style={[styles.keyDot, { backgroundColor: k.isActive ? COLORS.green : COLORS.muted }]} />
      <View style={styles.keyBody}>
        <Text style={styles.keyLabel}>{k.label}</Text>
        <Text style={styles.keySecret}>{preview}</Text>
      </View>
      <Switch value={k.isActive} onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.green }}
        thumbColor={k.isActive ? '#fff' : COLORS.muted} />
      <TouchableOpacity onPress={onDelete} style={{ paddingHorizontal: 8 }}>
        <Text style={styles.deleteText}>✕</Text>
      </TouchableOpacity>
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
  statRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1, backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    padding: 12, alignItems: 'center',
  },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
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
  workflowCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceElevated, borderRadius: 8, padding: 12, gap: 10,
  },
  workflowName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  workflowSteps: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  workflowStepLine: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  deleteText: { color: COLORS.muted, fontSize: 16, padding: 4 },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 14,
  },
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
  dangerLightBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
    paddingVertical: 8, alignItems: 'center',
  },
  dangerLightText: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  secondaryBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.surfaceElevated,
  },
  secondaryBtnText: { color: COLORS.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  emptyText: { color: COLORS.muted, fontSize: 12 },
  about: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  aboutTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  aboutSub: { color: COLORS.muted, fontSize: 11, letterSpacing: 1 },

  providerPickRow: { flexDirection: 'row', gap: 8 },
  providerPick: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12,
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
  keySecret: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  addKeyBtn: {
    borderWidth: 1, borderColor: COLORS.highlight + '60', borderRadius: 8, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center',
  },
  addKeyText: { color: COLORS.highlight, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  agentPinRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, borderRadius: 4,
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  colorDotSmall: { width: 6, height: 6, borderRadius: 3 },
  pinAgentName: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  pinValueText: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  assetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
  },
  assetIcon: { fontSize: 18 },
  assetLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  assetRef: { color: COLORS.muted, fontSize: 11, marginTop: 2 },

  wfStepCard: {
    borderLeftWidth: 3, borderRadius: 6, padding: 10, gap: 8,
    backgroundColor: COLORS.surfaceElevated, marginBottom: 8,
  },
  wfStepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wfStepNum: { color: COLORS.muted, fontSize: 11, fontWeight: '800', width: 28 },
  wfAgentChip: {
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
  },
  wfAgentChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  addStepBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', marginBottom: 8,
  },
  addStepText: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modal: {
    backgroundColor: COLORS.darkBg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 20, width: '90%', maxWidth: 520, gap: 8,
    maxHeight: '92%',
  },
  modalTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 6 },
  inlineError: {
    color: COLORS.red, fontSize: 12, marginVertical: 8,
    backgroundColor: COLORS.red + '10', padding: 8, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.red + '40',
  },
  inlineSuccess: {
    color: COLORS.green, fontSize: 12, marginVertical: 8,
    backgroundColor: COLORS.green + '10', padding: 8, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.green + '40',
  },
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
    padding: 10, marginBottom: 6, backgroundColor: COLORS.surfaceElevated,
  },
  modelOptionCompact: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
    padding: 8, marginBottom: 4, backgroundColor: COLORS.surfaceElevated,
  },
  modelOptionActive: { borderColor: COLORS.highlight, backgroundColor: COLORS.highlight + '10' },
  modelOptionLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  modelOptionId: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
});
