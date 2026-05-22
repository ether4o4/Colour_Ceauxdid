import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SwarmAgent, SwarmMessage, PinnedMemory } from '../types';
import { COLORS } from '../utils/theme';
import { DEFAULT_AGENTS } from '../agents/config';
import { addPinnedMemory } from '../store';
import { speakMessage, stopSpeaking } from '../utils/tts';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  visible: boolean;
  message: SwarmMessage | null;
  mode: 'project' | 'agent' | 'saved';
  customAgents: SwarmAgent[];
  projectAgents?: SwarmAgent[];          // available agents in current group
  currentAgentId?: string;                // when mode === 'agent'
  currentScopeKey?: string;               // for pinning source tracking
  onClose: () => void;
  onContinueInDm: (agentId: string, sourceMessage: SwarmMessage) => void;
  onAskAnother: (agentId: string, sourceMessage: SwarmMessage) => void;
  onDelete: (message: SwarmMessage) => void;
  onMemoryPinned?: () => void;
}

export default function MessageActionsMenu(props: Props) {
  const {
    visible, message, mode, customAgents, projectAgents = [], currentAgentId,
    currentScopeKey, onClose, onContinueInDm, onAskAnother, onDelete, onMemoryPinned,
  } = props;

  const [view, setView] = useState<'main' | 'dm' | 'ask' | 'pin'>('main');
  const [pinKey, setPinKey] = useState('');
  const [pinTargetAgent, setPinTargetAgent] = useState<string>('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) { setView('main'); setPinKey(''); setPinTargetAgent(''); }
  }, [visible]);

  if (!message) return null;

  const allAgents = [...DEFAULT_AGENTS, ...customAgents];
  const senderAgent = allAgents.find(a => a.id === message.senderId);
  const isUserMsg = !message.isAgent;

  async function handleCopy() {
    try { await Clipboard.setStringAsync(message!.text); } catch {}
    onClose();
  }

  async function handleSpeak() {
    if (!senderAgent) return;
    onClose();
    stopSpeaking();
    const res = await speakMessage(senderAgent, message!.text);
    if (!res.ok && res.error) {
      // surfaced via console; UI stays quiet to avoid a blocking alert
      console.warn('TTS:', res.error);
    }
  }

  async function handlePinSubmit() {
    if (!pinTargetAgent || !pinKey.trim()) return;
    setSaving(true);
    const mem: PinnedMemory = {
      id: uuidv4(),
      agentId: pinTargetAgent,
      key: pinKey.trim().slice(0, 60),
      value: message!.text.slice(0, 1000),
      sourceMessageId: message!.id,
      sourceScopeKey: currentScopeKey,
      createdAt: Date.now(),
    };
    await addPinnedMemory(mem);
    setSaving(false);
    onMemoryPinned?.();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          {/* Message preview */}
          <View style={[styles.preview, senderAgent && { borderLeftColor: senderAgent.colorHex }]}>
            <Text style={styles.previewMeta}>
              {isUserMsg ? 'YOU' : (senderAgent?.name.toUpperCase() || 'MESSAGE')}
            </Text>
            <Text style={styles.previewText} numberOfLines={4}>{message.text}</Text>
          </View>

          {view === 'main' && (
            <>
              {mode === 'project' && senderAgent && message.isAgent && (
                <>
                  <ActionRow
                    icon="➡"
                    label={`Continue in ${senderAgent.name}'s DM`}
                    hint="Keep talking to just this agent — group context carries over"
                    color={senderAgent.colorHex}
                    testID="action-continue-dm"
                    onPress={() => onContinueInDm(senderAgent.id, message)}
                  />
                </>
              )}
              <ActionRow
                icon="↗"
                label="Ask another agent about this"
                hint="Forward this as a question to a specific color"
                testID="action-ask-another"
                onPress={() => setView('ask')}
              />
              <ActionRow
                icon="📌"
                label="Pin to an agent's memory"
                hint="Save as a persistent fact in that agent's system prompt"
                testID="action-pin"
                onPress={() => setView('pin')}
              />
              {message.isAgent && senderAgent && (
                <ActionRow
                  icon="🔊"
                  label={`Speak in ${senderAgent.name}'s voice`}
                  hint="Read this message aloud (needs an ElevenLabs key in Settings → Voice)"
                  color={senderAgent.colorHex}
                  testID="action-speak"
                  onPress={handleSpeak}
                />
              )}
              <ActionRow
                icon="⎘"
                label="Copy"
                testID="action-copy"
                onPress={handleCopy}
              />
              {mode !== 'saved' && (
                <ActionRow
                  icon="✕"
                  label="Delete message"
                  danger
                  testID="action-delete"
                  onPress={() => { onDelete(message); onClose(); }}
                />
              )}
            </>
          )}

          {view === 'ask' && (
            <>
              <Text style={styles.pickerTitle}>ASK WHICH AGENT?</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {allAgents
                  .filter(a => a.id !== message.senderId)
                  .filter(a => mode !== 'project' || projectAgents.find(pa => pa.id === a.id))
                  .map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.agentPick, { borderLeftColor: a.colorHex }]}
                    onPress={() => onAskAnother(a.id, message)}
                    testID={`ask-target-${a.id}`}
                  >
                    <View style={[styles.pickDot, { backgroundColor: a.colorHex }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickName, { color: a.colorHex }]}>{a.name.toUpperCase()}</Text>
                      <Text style={styles.pickDesc}>{a.specialty}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <BackRow onBack={() => setView('main')} />
            </>
          )}

          {view === 'pin' && (
            <>
              <Text style={styles.pickerTitle}>PIN TO WHOSE MEMORY?</Text>
              <ScrollView style={{ maxHeight: 180 }}>
                {allAgents.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.agentPick,
                      { borderLeftColor: a.colorHex },
                      pinTargetAgent === a.id && { backgroundColor: a.colorHex + '20' },
                    ]}
                    onPress={() => setPinTargetAgent(a.id)}
                    testID={`pin-target-${a.id}`}
                  >
                    <View style={[styles.pickDot, { backgroundColor: a.colorHex }]} />
                    <Text style={[styles.pickName, { color: a.colorHex }]}>{a.name.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>LABEL FOR THIS FACT</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 'my timezone' or 'project codename'"
                placeholderTextColor={COLORS.muted}
                value={pinKey}
                onChangeText={setPinKey}
                maxLength={60}
                testID="pin-key-input"
              />
              <View style={styles.pinButtons}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setView('main')}>
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (!pinTargetAgent || !pinKey.trim() || saving) && { opacity: 0.4 }]}
                  disabled={!pinTargetAgent || !pinKey.trim() || saving}
                  onPress={handlePinSubmit}
                  testID="pin-save-button"
                >
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Pin it</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function ActionRow({ icon, label, hint, color, danger, onPress, testID }: {
  icon: string; label: string; hint?: string; color?: string; danger?: boolean;
  onPress: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} testID={testID}>
      <Text style={[styles.actionIcon, color ? { color } : null, danger && { color: COLORS.red }]}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, danger && { color: COLORS.red }]}>{label}</Text>
        {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <TouchableOpacity style={styles.backRow} onPress={onBack}>
      <Text style={styles.backText}>← Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.darkBg, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, paddingHorizontal: 16, maxHeight: '82%',
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: COLORS.border, borderRadius: 2, marginBottom: 10,
  },
  preview: {
    borderLeftWidth: 3, borderLeftColor: COLORS.border,
    backgroundColor: COLORS.surface, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  previewMeta: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  previewText: { color: COLORS.text, fontSize: 13, marginTop: 4, lineHeight: 18 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '40',
  },
  actionIcon: { fontSize: 16, color: COLORS.text, width: 22, textAlign: 'center' },
  actionLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  actionHint: { color: COLORS.muted, fontSize: 11, marginTop: 2 },

  pickerTitle: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginVertical: 8 },
  agentPick: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: COLORS.surface, marginBottom: 6,
  },
  pickDot: { width: 8, height: 8, borderRadius: 4 },
  pickName: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  pickDesc: { color: COLORS.muted, fontSize: 11, marginTop: 2 },

  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 12 },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, marginTop: 6,
  },
  pinButtons: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 10 },
  secondaryBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  secondaryText: { color: COLORS.text, fontSize: 13 },
  primaryBtn: { flex: 1, backgroundColor: COLORS.highlight, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  backRow: { alignItems: 'center', paddingVertical: 12 },
  backText: { color: COLORS.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
