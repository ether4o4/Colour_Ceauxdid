import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  StatusBar, Modal, TextInput, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwarmAgent } from '../types';
import { COLORS } from '../utils/theme';
import { DEFAULT_AGENTS } from '../agents/config';
import { AGENT_TEMPLATES, AgentTemplate, buildAgentSystemPrompt, getTemplateById } from '../agents/templates';
import { getCustomAgents, saveCustomAgent, deleteCustomAgent } from '../store';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const MAX_CUSTOM = 5;
const MAX_NAME = 20;
const MAX_STEERING = 75;

type ModalState =
  | { type: 'none' }
  | { type: 'picker' }
  | { type: 'form'; template: AgentTemplate; existing?: SwarmAgent };

export default function AgentsScreen() {
  const [customAgents, setCustomAgents] = useState<SwarmAgent[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  // Form state
  const [agentName, setAgentName] = useState('');
  const [steering, setSteering] = useState<[string, string, string]>(['', '', '']);

  const load = useCallback(async () => {
    setCustomAgents(await getCustomAgents());
  }, []);

  useEffect(() => { load(); }, [load]);

  function openPicker() {
    setModal({ type: 'picker' });
  }

  function selectTemplate(template: AgentTemplate) {
    setAgentName('');
    setSteering(['', '', '']);
    setModal({ type: 'form', template });
  }

  function openEdit(agent: SwarmAgent) {
    const template = getTemplateById(agent.templateType ?? '');
    if (!template) return;
    setAgentName(agent.name);
    setSteering([
      agent.steeringPrompts?.[0] ?? '',
      agent.steeringPrompts?.[1] ?? '',
      agent.steeringPrompts?.[2] ?? '',
    ]);
    setModal({ type: 'form', template, existing: agent });
  }

  function closeModal() {
    setModal({ type: 'none' });
    setAgentName('');
    setSteering(['', '', '']);
  }

  async function handleDeploy() {
    if (modal.type !== 'form') return;
    const { template, existing } = modal;

    if (!agentName.trim()) {
      Alert.alert('Name required', 'Give your agent a name.');
      return;
    }

    const activePrompts = steering.filter(s => s.trim().length > 0);
    const systemPrompt = buildAgentSystemPrompt(template, agentName.trim(), activePrompts);

    const agent: SwarmAgent = {
      id: existing?.id ?? uuidv4(),
      name: agentName.trim(),
      color: 'custom',
      colorHex: template.colorHex,
      specialty: template.label,
      personality: template.description,
      systemPrompt,
      isCustom: true,
      templateType: template.id,
      steeringPrompts: steering.map(s => s.trim()),
      load: 0,
      status: 'idle',
    };

    await saveCustomAgent(agent);
    await load();
    closeModal();
  }

  async function handleDelete(agent: SwarmAgent) {
    Alert.alert(
      'Remove Agent',
      `Remove ${agent.name} from the swarm?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => { await deleteCustomAgent(agent.id); await load(); },
        },
      ]
    );
  }

  const updateSteering = (index: 0 | 1 | 2, value: string) => {
    setSteering(prev => {
      const next: [string, string, string] = [...prev] as [string, string, string];
      next[index] = value.slice(0, MAX_STEERING);
      return next;
    });
  };

  // Build 5 fixed slots — filled or empty
  const slots: (SwarmAgent | null)[] = [
    ...customAgents,
    ...Array(MAX_CUSTOM - customAgents.length).fill(null),
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>AGENT ROSTER</Text>
        <Text style={styles.headerSub}>{DEFAULT_AGENTS.length + customAgents.length}/10</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Core agents — view only */}
        <Text style={styles.sectionLabel}>CORE AGENTS</Text>
        {DEFAULT_AGENTS.map(agent => (
          <CoreAgentCard key={agent.id} agent={agent} />
        ))}

        {/* Custom slots */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>CUSTOM AGENTS ({customAgents.length}/{MAX_CUSTOM})</Text>
        </View>

        {slots.map((agent, i) =>
          agent ? (
            <CustomAgentCard
              key={agent.id}
              agent={agent}
              onEdit={() => openEdit(agent)}
              onDelete={() => handleDelete(agent)}
            />
          ) : (
            <TouchableOpacity key={`empty-${i}`} style={styles.emptySlot} onPress={openPicker}>
              <Text style={styles.emptySlotIcon}>+</Text>
              <Text style={styles.emptySlotText}>Empty Slot</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      {/* Template Picker Modal */}
      <Modal visible={modal.type === 'picker'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>CHOOSE TEMPLATE</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.templateGrid}>
              {AGENT_TEMPLATES.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.templateCard, { borderColor: t.colorHex + '60' }]}
                  onPress={() => selectTemplate(t)}
                >
                  <View style={[styles.templateDot, { backgroundColor: t.colorHex }]} />
                  <Text style={[styles.templateLabel, { color: t.colorHex }]}>{t.label.toUpperCase()}</Text>
                  <Text style={styles.templateDesc}>{t.description}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Agent Form Modal */}
      {modal.type === 'form' && (
        <Modal visible transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>
                    {modal.existing ? 'EDIT AGENT' : 'DEPLOY AGENT'}
                  </Text>
                  <View style={styles.templateBadge}>
                    <View style={[styles.templateDotSm, { backgroundColor: modal.template.colorHex }]} />
                    <Text style={[styles.templateBadgeText, { color: modal.template.colorHex }]}>
                      {modal.template.label.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeModal}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.formContent}>
                {/* Name */}
                <Text style={styles.fieldLabel}>AGENT NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Name your agent..."
                  placeholderTextColor={COLORS.muted}
                  value={agentName}
                  onChangeText={t => setAgentName(t.slice(0, MAX_NAME))}
                  maxLength={MAX_NAME}
                />
                <Text style={styles.charCount}>{agentName.length}/{MAX_NAME}</Text>

                {/* Steering prompts */}
                <Text style={styles.fieldLabel}>BEHAVIORAL STEERING</Text>
                <Text style={styles.fieldSub}>
                  Up to 3 short directives that steer this agent's behavior.
                  Max {MAX_STEERING} characters each.
                </Text>

                {([0, 1, 2] as const).map(i => (
                  <View key={i} style={styles.steeringRow}>
                    <Text style={styles.steeringNum}>{i + 1}</Text>
                    <View style={styles.steeringInputWrap}>
                      <TextInput
                        style={styles.steeringInput}
                        placeholder={modal.template.steeringPlaceholders[i]}
                        placeholderTextColor={COLORS.muted}
                        value={steering[i]}
                        onChangeText={v => updateSteering(i, v)}
                        maxLength={MAX_STEERING}
                      />
                      <Text style={styles.steeringCount}>
                        {steering[i].length}/{MAX_STEERING}
                      </Text>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.deployBtn, { backgroundColor: modal.template.colorHex }]}
                  onPress={handleDeploy}
                >
                  <Text style={styles.deployBtnText}>
                    {modal.existing ? 'SAVE CHANGES' : 'DEPLOY AGENT'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// Core agent card — no edit/delete
function CoreAgentCard({ agent }: { agent: SwarmAgent }) {
  return (
    <View style={[styles.card, { borderLeftColor: agent.colorHex }]}>
      <View style={[styles.cardDot, { backgroundColor: agent.colorHex }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: agent.colorHex }]}>{agent.name.toUpperCase()}</Text>
        <Text style={styles.cardSpecialty}>{agent.specialty}</Text>
        <Text style={styles.cardPersonality}>{agent.personality}</Text>
      </View>
    </View>
  );
}

// Custom agent card — edit + delete
function CustomAgentCard({
  agent, onEdit, onDelete,
}: { agent: SwarmAgent; onEdit: () => void; onDelete: () => void }) {
  const template = getTemplateById(agent.templateType ?? '');
  const firstSteering = agent.steeringPrompts?.find(s => s.trim().length > 0);

  return (
    <View style={[styles.card, { borderLeftColor: agent.colorHex }]}>
      <View style={[styles.cardDot, { backgroundColor: agent.colorHex }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: agent.colorHex }]}>{agent.name.toUpperCase()}</Text>
        {template && (
          <Text style={[styles.templateTag, { color: agent.colorHex + 'aa' }]}>
            {template.label.toUpperCase()}
          </Text>
        )}
        {firstSteering && (
          <Text style={styles.steeringPreview}>"{firstSteering}"</Text>
        )}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <Text style={styles.editBtnText}>EDIT</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  headerSub: { color: COLORS.green, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  content: { padding: 12, gap: 8, paddingBottom: 60 },
  sectionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 8, marginBottom: 6 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },

  // Cards
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 3, borderRadius: 10, padding: 14, gap: 12,
  },
  cardDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  cardBody: { flex: 1, gap: 3 },
  cardName: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  cardSpecialty: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  cardPersonality: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  templateTag: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  steeringPreview: { color: COLORS.muted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  cardActions: { alignItems: 'flex-end', gap: 10 },
  editBtn: {
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
  },
  editBtnText: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  deleteBtnText: { color: COLORS.muted, fontSize: 16, padding: 2 },

  // Empty slot
  emptySlot: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: 'dashed', borderRadius: 10, padding: 16,
  },
  emptySlotIcon: { color: COLORS.muted, fontSize: 20, fontWeight: '300' },
  emptySlotText: { color: COLORS.muted, fontSize: 13, fontWeight: '500' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sheetTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  closeBtn: { color: COLORS.muted, fontSize: 18, padding: 4 },
  templateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  templateDotSm: { width: 6, height: 6, borderRadius: 3 },
  templateBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },

  // Template grid
  templateGrid: { padding: 16, gap: 10 },
  templateCard: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderRadius: 12,
    padding: 16, gap: 6,
  },
  templateDot: { width: 10, height: 10, borderRadius: 5 },
  templateLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  templateDesc: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },

  // Form
  formContent: { padding: 20, gap: 10, paddingBottom: 40 },
  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  fieldSub: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 14,
  },
  charCount: { color: COLORS.muted, fontSize: 10, textAlign: 'right', marginTop: 2 },
  steeringRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  steeringNum: { color: COLORS.muted, fontSize: 13, fontWeight: '700', marginTop: 14, width: 14 },
  steeringInputWrap: { flex: 1 },
  steeringInput: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 13,
  },
  steeringCount: { color: COLORS.muted, fontSize: 9, textAlign: 'right', marginTop: 3 },
  deployBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  deployBtnText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
});
