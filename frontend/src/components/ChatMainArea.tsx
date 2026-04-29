import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../utils/theme';
import { SwarmMessage, SwarmAgent, Project, SavedChat } from '../types';
import { DEFAULT_AGENTS, routeMessage } from '../agents/config';
import {
  getMessages, saveMessage, updateMessage,
  getCustomAgents, saveChatSession, getGroupMessagesForAgent,
  ChatScope, clearScope,
} from '../store';
import { streamAgentResponse } from '../utils/api';
import MessageBubble from './MessageBubble';
import AgentStrip from './AgentStrip';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

interface ChatMainAreaProps {
  project?: Project;
  agentId?: string;
  savedChat?: SavedChat;
  mode: 'project' | 'agent' | 'saved';
  onDataChange?: () => void;
}

export default function ChatMainArea({ project, agentId, savedChat, mode, onDataChange }: ChatMainAreaProps) {
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [input, setInput] = useState('');
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [customAgents, setCustomAgents] = useState<SwarmAgent[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveChatName, setSaveChatName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Current scope — single source of truth for reads AND writes.
  const scope: ChatScope | null =
    mode === 'project' && project ? { type: 'project', id: project.id }
    : mode === 'agent' && agentId ? { type: 'agent', id: agentId }
    : null;

  const loadData = useCallback(async () => {
    const customs = await getCustomAgents();
    setCustomAgents(customs);

    if (mode === 'saved' && savedChat) {
      // Saved chats are read-only snapshots
      setMessages(savedChat.messages);
    } else if (scope) {
      // Each 1-on-1 and each group reads from its OWN bucket — fully isolated.
      const msgs = await getMessages(scope);
      setMessages(msgs);
    } else {
      setMessages([]);
    }
  }, [mode, savedChat, scope?.type, scope?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || !scope) return;
    setInput('');

    const userMsg: SwarmMessage = {
      id: uuidv4(),
      text,
      senderId: 'user',
      senderName: 'You',
      senderColor: '#ffffff',
      isAgent: false,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    await saveMessage(userMsg, scope);
    scrollToBottom();

    if (mode === 'agent' && agentId) {
      const agent = [...DEFAULT_AGENTS, ...customAgents].find(a => a.id === agentId);
      if (agent) await streamAgentMessage(agent, text);
    } else if (mode === 'project' && project) {
      const routedIds = routeMessage(text, customAgents);
      const toRespond = [...DEFAULT_AGENTS, ...customAgents]
        .filter(a => project.agents.includes(a.id) && routedIds.includes(a.id));
      const fallback = toRespond.length > 0
        ? toRespond
        : [...DEFAULT_AGENTS, ...customAgents].filter(a => project.agents.includes(a.id)).slice(0, 2);
      for (let i = 0; i < fallback.length; i++) {
        // slight stagger to feel like separate agents
        await new Promise(r => setTimeout(r, i * 700));
        await streamAgentMessage(fallback[i], text);
      }
    }
  }

  /**
   * Build the LLM context for a single agent reply based on the memory rules:
   *   - In 1-on-1 with agent X: that agent's private chat history + group-chat
   *     history from any project where X participates (group → individual flow).
   *   - In group chat:           that group's history only, NO leakage from
   *                              anyone's private 1-on-1s.
   */
  async function buildContextForAgent(agent: SwarmAgent): Promise<SwarmMessage[]> {
    if (!scope) return [];
    if (scope.type === 'project') {
      // Group scope: only this project's history. No leakage from private chats.
      return await getMessages(scope);
    }
    // Agent scope: private history + inherited group memory where agent participates
    const priv = await getMessages(scope);
    const groupMem = await getGroupMessagesForAgent(agent.id, 30);
    // Merge by timestamp to keep conversational order
    const merged = [...groupMem, ...priv].sort((a, b) => a.timestamp - b.timestamp);
    return merged.slice(-60);
  }

  async function streamAgentMessage(agent: SwarmAgent, userMessage: string) {
    if (!scope) return;
    const msgId = uuidv4();
    const agentMsg: SwarmMessage = {
      id: msgId,
      text: '',
      senderId: agent.id,
      senderName: agent.name,
      senderColor: agent.colorHex,
      isAgent: true,
      timestamp: Date.now(),
    };

    setTypingAgents(prev => new Set([...prev, agent.id]));
    setMessages(prev => [...prev, agentMsg]);
    scrollToBottom();

    await new Promise(r => setTimeout(r, 400));
    setTypingAgents(prev => { const s = new Set(prev); s.delete(agent.id); return s; });

    const context = await buildContextForAgent(agent);
    let fullResponse = '';

    await streamAgentResponse(
      agent,
      userMessage,
      context,
      (chunk: string) => {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: fullResponse } : m));
        scrollToBottom();
      },
      () => {},
      (error: string) => {
        // Surface the error INSIDE the bubble so user immediately sees what failed
        fullResponse = fullResponse || `⚠ ${error}`;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: fullResponse } : m));
        setTypingAgents(prev => { const s = new Set(prev); s.delete(agent.id); return s; });
      },
    );

    const finalMsg: SwarmMessage = { ...agentMsg, text: fullResponse };
    await updateMessage(finalMsg, scope);
  }

  async function handleSaveChat() {
    if (!saveChatName.trim()) {
      Alert.alert('Error', 'Chat name is required');
      return;
    }
    const newSavedChat: SavedChat = {
      id: uuidv4(),
      name: saveChatName.trim(),
      projectId: project?.id,
      agentId: mode === 'agent' ? agentId : undefined,
      messages,
      createdAt: Date.now(),
      type: 'saved',
    };
    await saveChatSession(newSavedChat);
    setSaveChatName('');
    setShowSaveModal(false);
    onDataChange?.();
    Alert.alert('Saved', `"${newSavedChat.name}" archived. Find it in the Saved Chats sidebar.`);
  }

  async function handleClearThisChat() {
    if (!scope) return;
    Alert.alert(
      'Clear this chat?',
      `This only clears ${mode === 'agent' ? 'this 1-on-1' : 'this project\'s group chat'}. Other chats stay intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearScope(scope);
            setMessages([]);
            setMenuOpen(false);
          },
        },
      ]
    );
  }

  const headerTitle =
    mode === 'project' ? project?.name
    : mode === 'agent' ? [...DEFAULT_AGENTS, ...customAgents].find(a => a.id === agentId)?.name
    : savedChat?.name;

  const headerAccent =
    mode === 'agent' ? [...DEFAULT_AGENTS, ...customAgents].find(a => a.id === agentId)?.colorHex
    : undefined;

  const projectAgents = project
    ? [...DEFAULT_AGENTS, ...customAgents].filter(a => project.agents.includes(a.id))
    : [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, headerAccent ? { borderBottomColor: headerAccent + '60' } : null]}>
        <View style={styles.headerLeft}>
          {headerAccent ? <View style={[styles.headerDot, { backgroundColor: headerAccent }]} /> : null}
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle || 'Chat'}</Text>
          {mode === 'agent' && <Text style={styles.scopeTag}>1-on-1</Text>}
          {mode === 'project' && <Text style={styles.scopeTag}>GROUP</Text>}
          {mode === 'saved' && <Text style={styles.scopeTag}>ARCHIVED</Text>}
        </View>
        <View style={styles.headerRight}>
          {mode === 'project' && (
            <Text style={styles.onlineCount}>{projectAgents.length} agents</Text>
          )}
          <TouchableOpacity onPress={() => setMenuOpen(o => !o)} testID="chat-menu-button">
            <Text style={styles.headerIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu */}
      {menuOpen && (
        <View style={styles.menuDropdown}>
          {mode !== 'saved' && (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowSaveModal(true); }}>
                <Text style={styles.menuItemText}>Save this chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleClearThisChat}>
                <Text style={[styles.menuItemText, { color: COLORS.red }]}>Clear this chat</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.menuItem} onPress={() => setMenuOpen(false)}>
            <Text style={[styles.menuItemText, { color: COLORS.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Agent strip (group mode) */}
      {mode === 'project' && projectAgents.length > 0 && (
        <View style={styles.agentSelectorContainer}>
          <AgentStrip agents={projectAgents} typingAgents={typingAgents} />
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={msg => msg.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isStreaming={typingAgents.has(item.senderId) && !item.text} />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => scrollToBottom()}
        ListEmptyComponent={
          <View style={styles.emptyMsgs}>
            <Text style={styles.emptyMsgTitle}>
              {mode === 'agent' ? `Start chatting with ${headerTitle}`
               : mode === 'project' ? 'Group chat is empty'
               : 'Archived — read only'}
            </Text>
            <Text style={styles.emptyMsgSub}>
              {mode === 'agent'
                ? 'This is a private 1-on-1. Memory from group chats where this agent participates carries into this conversation — but what you say here stays private.'
                : mode === 'project'
                ? 'Mention agents with @Red @Blue @Green @Yellow @Purple or @swarm for everyone. Messages here are visible to this project only.'
                : ''}
            </Text>
          </View>
        }
      />

      {/* Input */}
      {mode !== 'saved' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inputContainer}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={mode === 'agent'
                ? `Message ${headerTitle}...`
                : 'Message the swarm (@Red @Blue @swarm...)'
              }
              placeholderTextColor={COLORS.muted}
              value={input}
              onChangeText={setInput}
              multiline
              testID="chat-input"
            />
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: headerAccent || COLORS.highlight }]}
              onPress={handleSend}
              testID="chat-send-button"
            >
              <Text style={styles.sendButtonText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Save Chat Modal */}
      <Modal visible={showSaveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save Chat</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Chat name..."
              placeholderTextColor={COLORS.muted}
              value={saveChatName}
              onChangeText={setSaveChatName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowSaveModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleSaveChat}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', flexShrink: 1 },
  scopeTag: {
    color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  onlineCount: { color: COLORS.muted, fontSize: 12 },
  headerIcon: { color: COLORS.text, fontSize: 20, paddingHorizontal: 8 },
  menuDropdown: {
    position: 'absolute', top: 48, right: 12, zIndex: 100,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    minWidth: 180, overflow: 'hidden',
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  menuItemText: { color: COLORS.text, fontSize: 13 },
  agentSelectorContainer: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  messageList: { paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 },
  emptyMsgs: { padding: 32, alignItems: 'center', gap: 8 },
  emptyMsgTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyMsgSub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  inputContainer: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.text, maxHeight: 120,
  },
  sendButton: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    minWidth: 44,
  },
  sendButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: COLORS.darkBg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 20, width: '85%', maxWidth: 420,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  modalInput: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.text, marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: {
    flex: 1, paddingVertical: 10, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalButtonText: { color: COLORS.text, textAlign: 'center', fontWeight: '600' },
  primaryButton: { backgroundColor: COLORS.highlight, borderColor: COLORS.highlight },
  primaryButtonText: { color: '#000', textAlign: 'center', fontWeight: '700' },
});
