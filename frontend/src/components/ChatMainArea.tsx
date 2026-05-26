import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../utils/theme';
import { SwarmMessage, SwarmAgent, Project, SavedChat, MessageUsage } from '../types';
import { DEFAULT_AGENTS, routeMessage } from '../agents/config';
import {
  getMessages, saveMessage, updateMessage, deleteMessage,
  getCustomAgents, saveChatSession, getGroupMessagesForAgent,
  ChatScope, clearScope, scopeKey as toScopeKey, getUsageStats,
  getProviderSettings,
} from '../store';
import { speakMessage } from '../utils/tts';
import { streamAgentResponse } from '../utils/api';
import { parseSlashCommand, extractAgentMentions, SLASH_COMMANDS_HELP } from '../utils/commands';
import MessageBubble from './MessageBubble';
import MessageActionsMenu from './MessageActionsMenu';
import AgentStrip from './AgentStrip';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

interface ChatMainAreaProps {
  project?: Project;
  agentId?: string;
  savedChat?: SavedChat;
  mode: 'project' | 'agent' | 'saved';
  /** When the user "continues in X's DM", this lets us show a context banner. */
  continueContext?: { fromProjectName: string; sourceText: string };
  onDataChange?: () => void;
  onContinueInDm?: (agentId: string, ctx: { fromProjectName: string; sourceText: string }) => void;
}

const MAX_MENTION_CHAIN = 3;

// Appended (invisibly to the user) to each agent's prompt in a multi-agent reply
// so they talk WITH each other instead of echoing the same points.
const SWARM_DIRECTIVE =
  "(Group chat: the others are replying too — their messages are above. Don't repeat a point already made. React to it: agree, build on it, or push back, and name who you're answering. Stay in your own voice.)";

// Order Red's build crew executes in: plan → analyze → build → expand → review.
const BUILD_ORDER = ['red', 'blue', 'green', 'yellow', 'purple'];

export default function ChatMainArea({
  project, agentId, savedChat, mode, continueContext, onDataChange, onContinueInDm,
}: ChatMainAreaProps) {
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [input, setInput] = useState('');
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [customAgents, setCustomAgents] = useState<SwarmAgent[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveChatName, setSaveChatName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatCost, setChatCost] = useState<{ cost: number; tokens: number }>({ cost: 0, tokens: 0 });
  const [actionMsg, setActionMsg] = useState<SwarmMessage | null>(null);
  const [showSlashHelp, setShowSlashHelp] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const scope: ChatScope | null =
    mode === 'project' && project ? { type: 'project', id: project.id }
    : mode === 'agent' && agentId ? { type: 'agent', id: agentId }
    : null;

  const allAgents = useMemo(() => [...DEFAULT_AGENTS, ...customAgents], [customAgents]);

  const projectAgents = useMemo(() =>
    project ? allAgents.filter(a => project.agents.includes(a.id)) : [],
  [project, allAgents]);

  const loadData = useCallback(async () => {
    const customs = await getCustomAgents();
    setCustomAgents(customs);
    if (mode === 'saved' && savedChat) {
      setMessages(savedChat.messages);
    } else if (scope) {
      const msgs = await getMessages(scope);
      setMessages(msgs);
      try {
        const stats = await getUsageStats({ scopeKey: toScopeKey(scope) });
        setChatCost({ cost: stats.totalCostUsd, tokens: stats.totalTokens });
      } catch {}
    } else {
      setMessages([]);
      setChatCost({ cost: 0, tokens: 0 });
    }
  }, [mode, savedChat, scope?.type, scope?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ────────── Send flow ──────────
  async function handleSend() {
    const text = input.trim();
    if (!text || !scope) return;
    setInput('');
    setShowSlashHelp(false);

    // Slash commands
    const cmd = parseSlashCommand(text);
    const resolvedText = cmd?.stripped ?? text;
    const forcedTargets = cmd?.targetAgentIds;
    const shouldPin = !!cmd?.pin;
    const buildMode = !!cmd?.buildMode;

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

    if (shouldPin) {
      // /remember <fact> auto-pins to Purple.
      try {
        const { addPinnedMemory } = await import('../store');
        await addPinnedMemory({
          id: uuidv4(),
          agentId: 'purple',
          key: `via /remember ${new Date().toLocaleString()}`,
          value: resolvedText.slice(0, 1000),
          sourceMessageId: userMsg.id,
          sourceScopeKey: toScopeKey(scope),
          createdAt: Date.now(),
        });
      } catch {}
    }

    if (mode === 'agent' && agentId) {
      const agent = allAgents.find(a => a.id === agentId);
      if (agent) await streamAgentMessage(agent, resolvedText);
    } else if (mode === 'project' && project) {
      if (buildMode) {
        await orchestrateBuild(resolvedText);
        return;
      }
      const targetIds = forcedTargets && forcedTargets.length
        ? forcedTargets
        : routeMessage(resolvedText, customAgents);
      const toRespond = allAgents
        .filter(a => project.agents.includes(a.id) && targetIds.includes(a.id));
      const fallback = toRespond.length > 0
        ? toRespond
        : allAgents.filter(a => project.agents.includes(a.id)).slice(0, 2);
      // When more than one agent answers, tell each to react to the others
      // rather than echo them.
      const directive = fallback.length > 1 ? SWARM_DIRECTIVE : undefined;
      for (let i = 0; i < fallback.length; i++) {
        await new Promise(r => setTimeout(r, i * 500));
        await streamAgentMessage(fallback[i], resolvedText, 0, directive);
      }
    }
  }

  // Memory inheritance rule:
  //   project scope → only that project's history
  //   agent scope   → private + group history where agent participates
  async function buildContextForAgent(agent: SwarmAgent): Promise<SwarmMessage[]> {
    if (!scope) return [];
    if (scope.type === 'project') {
      return await getMessages(scope);
    }
    const priv = await getMessages(scope);
    const groupMem = await getGroupMessagesForAgent(agent.id, 30);
    const merged = [...groupMem, ...priv].sort((a, b) => a.timestamp - b.timestamp);
    return merged.slice(-60);
  }

  async function streamAgentMessage(
    agent: SwarmAgent,
    userMessage: string,
    chainDepth = 0,
    directive?: string,
  ) {
    if (!scope) return;
    // The directive is sent to the model but never shown to the user.
    const apiUserMessage = directive ? `${userMessage}\n\n${directive}` : userMessage;

    const msgId = uuidv4();
    const agentMsg: SwarmMessage = {
      id: msgId, text: '',
      senderId: agent.id, senderName: agent.name, senderColor: agent.colorHex,
      isAgent: true, timestamp: Date.now(),
    };

    setTypingAgents(prev => new Set([...prev, agent.id]));
    setMessages(prev => [...prev, agentMsg]);
    scrollToBottom();
    await new Promise(r => setTimeout(r, 300));
    setTypingAgents(prev => { const s = new Set(prev); s.delete(agent.id); return s; });

    const context = await buildContextForAgent(agent);
    let fullResponse = '';
    let finalUsage: MessageUsage | undefined;

    await streamAgentResponse(
      agent, apiUserMessage, context,
      (chunk) => {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: fullResponse, contextNote: undefined } : m));
        scrollToBottom();
      },
      (usage) => { finalUsage = usage; },
      (error) => {
        fullResponse = fullResponse || `⚠ ${error}`;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: fullResponse, contextNote: undefined } : m));
        setTypingAgents(prev => { const s = new Set(prev); s.delete(agent.id); return s; });
      },
      {
        scopeKey: toScopeKey(scope),
        // Live "◍ searching for a free model…" note while the round-robin cycles.
        onStatus: (s) => {
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, contextNote: s || undefined } : m));
        },
      },
    );

    const finalMsg: SwarmMessage = { ...agentMsg, text: fullResponse, usage: finalUsage };
    setMessages(prev => prev.map(m => m.id === msgId ? finalMsg : m));
    await updateMessage(finalMsg, scope);

    // Auto-speak the reply in the agent's voice if enabled (and not an error).
    if (!fullResponse.startsWith('⚠')) {
      try {
        const ps = await getProviderSettings();
        if (ps.autoSpeak) {
          speakMessage(agent, fullResponse)
            .then(r => { setVoiceNote(r.ok ? '' : `🔊 ${r.error || 'voice failed'}`); })
            .catch(e => setVoiceNote(`🔊 ${e?.message || 'voice failed'}`));
        }
      } catch {}
    }

    // Refresh running cost footer
    try {
      const stats = await getUsageStats({ scopeKey: toScopeKey(scope) });
      setChatCost({ cost: stats.totalCostUsd, tokens: stats.totalTokens });
    } catch {}

    // ── Agent-to-agent @-mentions (group chats only, capped chain) ──
    if (mode === 'project' && project && chainDepth < MAX_MENTION_CHAIN) {
      const mentioned = extractAgentMentions(fullResponse, allAgents)
        .filter(id =>
          id !== agent.id                                     // don't self-loop
          && project.agents.includes(id)                      // must be in group
          && id !== 'user'                                    // ignore parsed @user-like
        );
      for (const mId of mentioned.slice(0, 2)) {
        const other = allAgents.find(a => a.id === mId);
        if (!other) continue;
        await new Promise(r => setTimeout(r, 400));
        await streamAgentMessage(
          other,
          `${agent.name} said: "${fullResponse}"\n\nRespond to what ${agent.name} said to you.`,
          chainDepth + 1,
        );
      }
    }
  }

  // ────────── Red-led build orchestration (/build) ──────────
  // Red posts a plan and assigns each color a part, then the rest of the team
  // executes their part in order — each sees Red's plan + the parts before it.
  async function orchestrateBuild(task: string) {
    if (!project || !scope) return;
    const proj = project;
    const team = BUILD_ORDER
      .map(id => allAgents.find(a => a.id === id))
      .filter((a): a is SwarmAgent => !!a && proj.agents.includes(a.id));
    const red = team.find(a => a.id === 'red');
    const rest = team.filter(a => a.id !== 'red');

    if (red) {
      await streamAgentMessage(
        red,
        `BUILD REQUEST: "${task}".\nYou're the lead. In 3–5 tight lines: state the approach, then assign each teammate one concrete part — write each as "Blue: …", "Green: …", "Yellow: …", "Purple: …". No fluff, just the call and the assignments.`,
      );
    }
    for (const a of rest) {
      await new Promise(r => setTimeout(r, 400));
      await streamAgentMessage(
        a,
        `Red is leading a build of: "${task}". Read Red's plan and any parts already posted above, then do YOUR part as ${a.name} (${a.specialty}) — just your piece, concrete and runnable where it applies. Don't redo anyone else's part.`,
      );
    }
  }

  // ────────── Action menu handlers ──────────
  function handleBubblePress(msg: SwarmMessage) { setActionMsg(msg); }

  function handleContinueInDm(agentId: string, sourceMessage: SwarmMessage) {
    setActionMsg(null);
    const fromProjectName = project?.name || 'group';
    onContinueInDm?.(agentId, { fromProjectName, sourceText: sourceMessage.text });
  }

  async function handleAskAnother(targetAgentId: string, sourceMessage: SwarmMessage) {
    setActionMsg(null);
    const target = allAgents.find(a => a.id === targetAgentId);
    if (!target || !scope) return;
    // Enqueue a user proxy message that quotes the source, then stream the target agent.
    const quoted = `@${target.name} thoughts on this?\n> ${sourceMessage.text.split('\n').join('\n> ')}`;
    const userMsg: SwarmMessage = {
      id: uuidv4(), text: quoted,
      senderId: 'user', senderName: 'You', senderColor: '#ffffff',
      isAgent: false, timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    await saveMessage(userMsg, scope);
    await streamAgentMessage(target, quoted);
  }

  async function handleDeleteMessage(msg: SwarmMessage) {
    if (!scope) return;
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    await deleteMessage(msg.id, scope);
  }

  // ────────── Save / clear ──────────
  async function handleSaveChat() {
    if (!saveChatName.trim()) { setSaveError('Name required'); return; }
    setSaveError('');
    const newSavedChat: SavedChat = {
      id: uuidv4(), name: saveChatName.trim(),
      projectId: project?.id, agentId: mode === 'agent' ? agentId : undefined,
      messages, createdAt: Date.now(), type: 'saved',
    };
    await saveChatSession(newSavedChat);
    setSaveChatName(''); setShowSaveModal(false);
    onDataChange?.();
  }

  async function handleClearThisChat() {
    if (!scope) return;
    setMenuOpen(false);
    await clearScope(scope);
    setMessages([]);
  }

  // ────────── Header info ──────────
  const headerTitle =
    mode === 'project' ? project?.name
    : mode === 'agent' ? allAgents.find(a => a.id === agentId)?.name
    : savedChat?.name;
  const headerAccent = mode === 'agent' ? allAgents.find(a => a.id === agentId)?.colorHex : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, headerAccent ? { borderBottomColor: headerAccent + '60' } : null]}>
        <View style={styles.headerLeft}>
          {headerAccent ? <View style={[styles.headerDot, { backgroundColor: headerAccent }]} /> : null}
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle || 'Chat'}</Text>
          {mode === 'agent' && <Text style={styles.scopeTag}>1-on-1</Text>}
          {mode === 'project' && <Text style={styles.scopeTag}>GROUP</Text>}
          {mode === 'saved' && <Text style={styles.scopeTag}>ARCHIVED</Text>}
        </View>
        <View style={styles.headerRight}>
          {chatCost.tokens > 0 && (
            <Text style={styles.costTag}>
              {chatCost.cost > 0 ? `$${chatCost.cost.toFixed(4)}` : `${chatCost.tokens}tok`}
            </Text>
          )}
          <TouchableOpacity onPress={() => setMenuOpen(o => !o)} testID="chat-menu-button">
            <Text style={styles.headerIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {menuOpen && (
        <View style={styles.menuDropdown}>
          {mode !== 'saved' && (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowSaveModal(true); }}>
                <Text style={styles.menuItemText}>Save this chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setShowSlashHelp(true); }}>
                <Text style={styles.menuItemText}>Slash commands</Text>
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

      {/* Continuity banner */}
      {mode === 'agent' && continueContext && (
        <View style={styles.continuityBanner}>
          <Text style={styles.continuityText}>
            Continuing from <Text style={{ fontWeight: '800' }}>{continueContext.fromProjectName}</Text> — group context inherited
          </Text>
        </View>
      )}

      {mode === 'project' && projectAgents.length > 0 && (
        <View style={styles.agentSelectorContainer}>
          <AgentStrip agents={projectAgents} typingAgents={typingAgents} />
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={msg => msg.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isStreaming={typingAgents.has(item.senderId) && !item.text}
            onPress={handleBubblePress}
          />
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
                ? 'This is a private 1-on-1. Memory from group chats where this agent participates flows in — but what you say here stays private.'
                : mode === 'project'
                ? 'Tap any message to route it, pin it, or jump to that agent\'s DM. @-mention agents in replies to auto-chain them.'
                : ''}
            </Text>
          </View>
        }
      />

      {voiceNote ? (
        <TouchableOpacity onPress={() => setVoiceNote('')} style={styles.voiceNote}>
          <Text style={styles.voiceNoteText}>{voiceNote}  (tap to dismiss)</Text>
        </TouchableOpacity>
      ) : null}

      {mode !== 'saved' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inputContainer}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={mode === 'agent'
                ? `Message ${headerTitle}... (/remember to pin)`
                : 'Message the swarm... (@Red, /plan, /swarm)'
              }
              placeholderTextColor={COLORS.muted}
              value={input}
              onChangeText={v => { setInput(v); setShowSlashHelp(v.trim().startsWith('/')); }}
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
          {showSlashHelp && (
            <View style={styles.slashHelp}>
              {SLASH_COMMANDS_HELP.map(c => (
                <Text key={c.cmd} style={[styles.slashItem, { color: c.color }]}>
                  <Text style={{ fontWeight: '800' }}>{c.cmd}</Text> · {c.desc}
                </Text>
              ))}
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Save Chat Modal (inline error, no Alert.alert) */}
      <Modal visible={showSaveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save Chat</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Chat name..."
              placeholderTextColor={COLORS.muted}
              value={saveChatName}
              onChangeText={v => { setSaveChatName(v); if (saveError) setSaveError(''); }}
              autoFocus
            />
            {saveError ? <Text style={styles.inlineError}>{saveError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => { setShowSaveModal(false); setSaveError(''); }}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleSaveChat}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Slash help modal */}
      <Modal visible={showSlashHelp && !input.trim().startsWith('/')} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SLASH COMMANDS</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {SLASH_COMMANDS_HELP.map(c => (
                <View key={c.cmd} style={styles.slashRow}>
                  <Text style={[styles.slashCmd, { color: c.color }]}>{c.cmd}</Text>
                  <Text style={styles.slashDesc}>{c.desc}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={() => setShowSlashHelp(false)}>
              <Text style={styles.primaryButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <MessageActionsMenu
        visible={actionMsg != null}
        message={actionMsg}
        mode={mode}
        customAgents={customAgents}
        projectAgents={projectAgents}
        currentAgentId={agentId}
        currentScopeKey={scope ? toScopeKey(scope) : undefined}
        onClose={() => setActionMsg(null)}
        onContinueInDm={handleContinueInDm}
        onAskAnother={handleAskAnother}
        onDelete={handleDeleteMessage}
        onMemoryPinned={() => {}}
        onSpeakResult={(note) => setVoiceNote(note)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  voiceNote: {
    marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: COLORS.red, borderRadius: 8,
  },
  voiceNoteText: { color: '#ffb3b3', fontSize: 12 },
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
  costTag: {
    color: COLORS.green, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    backgroundColor: COLORS.green + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  headerIcon: { color: COLORS.text, fontSize: 20, paddingHorizontal: 8 },
  menuDropdown: {
    position: 'absolute', top: 48, right: 12, zIndex: 100,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    minWidth: 180, overflow: 'hidden',
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  menuItemText: { color: COLORS.text, fontSize: 13 },
  continuityBanner: {
    backgroundColor: COLORS.highlight + '18',
    borderBottomWidth: 1, borderBottomColor: COLORS.highlight + '40',
    paddingVertical: 8, paddingHorizontal: 14,
  },
  continuityText: { color: COLORS.highlight, fontSize: 11, letterSpacing: 0.5 },
  agentSelectorContainer: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  messageList: { paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 },
  emptyMsgs: { padding: 32, alignItems: 'center', gap: 8 },
  emptyMsgTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyMsgSub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 340 },
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
  slashHelp: {
    marginTop: 8, padding: 8,
    backgroundColor: COLORS.surface, borderRadius: 6, gap: 3,
  },
  slashItem: { fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: COLORS.darkBg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 20, width: '85%', maxWidth: 480,
  },
  modalTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  modalInput: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, marginBottom: 10,
  },
  inlineError: {
    color: COLORS.red, fontSize: 12, marginBottom: 10,
    backgroundColor: COLORS.red + '10', padding: 8, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.red + '40',
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: {
    flex: 1, paddingVertical: 10, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalButtonText: { color: COLORS.text, textAlign: 'center', fontWeight: '600' },
  primaryButton: { backgroundColor: COLORS.highlight, borderColor: COLORS.highlight },
  primaryButtonText: { color: '#000', textAlign: 'center', fontWeight: '700' },
  slashRow: { flexDirection: 'row', paddingVertical: 8, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border + '40' },
  slashCmd: { fontSize: 12, fontWeight: '800', letterSpacing: 1, minWidth: 110 },
  slashDesc: { color: COLORS.text, fontSize: 12, flex: 1 },
});
