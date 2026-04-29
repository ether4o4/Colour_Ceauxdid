import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, StatusBar, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Task } from '../types';
import { COLORS } from '../utils/theme';
import { getTasks, saveTask, deleteTask } from '../store';
import { DEFAULT_AGENTS } from '../agents/config';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.muted,
  active: COLORS.blue,
  complete: COLORS.green,
  failed: COLORS.red,
};

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  active: '◉',
  complete: '●',
  failed: '✕',
};

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  useEffect(() => { loadTasks(); }, []);

  async function loadTasks() {
    setTasks(await getTasks());
  }

  async function createTask() {
    if (!title.trim()) return;
    const task: Task = {
      id: uuidv4(),
      title: title.trim(),
      description: description.trim() || undefined,
      status: 'pending',
      assignedAgents: selectedAgents,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTask(task);
    await loadTasks();
    setTitle(''); setDescription(''); setSelectedAgents([]);
    setShowCreate(false);
  }

  async function cycleStatus(task: Task) {
    const order: Task['status'][] = ['pending', 'active', 'complete', 'failed'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    const updated = { ...task, status: next, updatedAt: Date.now() };
    await saveTask(updated);
    await loadTasks();
  }

  async function handleDelete(id: string) {
    await deleteTask(id);
    await loadTasks();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>TASK TRACKER</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addBtnText}>+ NEW</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={t => t.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>NO TASKS — CREATE ONE</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.taskCard}>
            <TouchableOpacity onPress={() => cycleStatus(item)} style={styles.statusBtn}>
              <Text style={[styles.statusIcon, { color: STATUS_COLORS[item.status] }]}>
                {STATUS_ICONS[item.status]}
              </Text>
            </TouchableOpacity>
            <View style={styles.taskBody}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              {item.description && <Text style={styles.taskDesc}>{item.description}</Text>}
              <View style={styles.taskMeta}>
                <Text style={[styles.taskStatus, { color: STATUS_COLORS[item.status] }]}>
                  {item.status.toUpperCase()}
                </Text>
                {item.assignedAgents.length > 0 && (
                  <View style={styles.agentTags}>
                    {item.assignedAgents.map(id => {
                      const agent = DEFAULT_AGENTS.find(a => a.id === id);
                      return agent ? (
                        <View key={id} style={[styles.agentTag, { borderColor: agent.colorHex }]}>
                          <Text style={[styles.agentTagText, { color: agent.colorHex }]}>{agent.name}</Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NEW TASK</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Task title..."
              placeholderTextColor={COLORS.muted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="Description (optional)..."
              placeholderTextColor={COLORS.muted}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.modalLabel}>ASSIGN AGENTS</Text>
            <View style={styles.agentGrid}>
              {DEFAULT_AGENTS.map(agent => {
                const selected = selectedAgents.includes(agent.id);
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={[styles.agentChip, { borderColor: selected ? agent.colorHex : COLORS.border }]}
                    onPress={() => {
                      setSelectedAgents(prev =>
                        selected ? prev.filter(id => id !== agent.id) : [...prev, agent.id]
                      );
                    }}
                  >
                    <Text style={[styles.agentChipText, { color: selected ? agent.colorHex : COLORS.muted }]}>
                      {agent.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={createTask}>
                <Text style={styles.createBtnText}>CREATE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  addBtn: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.blue,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  addBtnText: { color: COLORS.blue, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 11, letterSpacing: 2 },
  taskCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  statusBtn: { paddingTop: 2 },
  statusIcon: { fontSize: 18, lineHeight: 22 },
  taskBody: { flex: 1 },
  taskTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  taskDesc: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  taskStatus: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  agentTags: { flexDirection: 'row', gap: 4 },
  agentTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  agentTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: COLORS.muted, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14,
  },
  modalTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  modalInput: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 14,
  },
  modalLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  agentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  agentChip: {
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: COLORS.surfaceElevated,
  },
  agentChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, backgroundColor: COLORS.surfaceElevated, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  createBtn: {
    flex: 1, backgroundColor: COLORS.blue, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});
