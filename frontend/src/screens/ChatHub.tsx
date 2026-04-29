import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, Dimensions, Alert, Modal, TextInput,
  TouchableOpacity, Text, FlatList, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../utils/theme';
import { Project, SavedChat, SwarmAgent } from '../types';
import { DEFAULT_AGENTS, CUSTOM_AGENT_COLORS } from '../agents/config';
import {
  getProjects, saveProject, getActiveProjectId, setActiveProjectId,
  getSavedChats, getCustomAgents, saveCustomAgent,
} from '../store';
import SidebarNavigation from '../components/SidebarNavigation';
import ChatMainArea from '../components/ChatMainArea';
import { v4 as uuidv4 } from 'uuid';

export default function ChatHub() {
  const [activeSection, setActiveSection] = useState<'project' | 'agent' | 'saved'>('project');
  const [activeProjectId, setActiveProjectIdState] = useState<string | undefined>();
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [activeSavedChatId, setActiveSavedChatId] = useState<string | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [customAgents, setCustomAgents] = useState<SwarmAgent[]>([]);

  // Mobile panel state — shows list picker when no item selected
  const [mobilePanelVisible, setMobilePanelVisible] = useState(false);

  // New project modal
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Create agent modal
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentColor, setAgentColor] = useState(CUSTOM_AGENT_COLORS[0]);

  const windowWidth = Dimensions.get('window').width;
  const isLargeScreen = windowWidth > 800;

  const loadData = useCallback(async () => {
    const [p, s, c] = await Promise.all([getProjects(), getSavedChats(), getCustomAgents()]);
    setProjects(p);
    setSavedChats(s);
    setCustomAgents(c);

    const activeId = await getActiveProjectId();
    if (activeId && p.find(proj => proj.id === activeId)) {
      setActiveProjectIdState(activeId);
      setActiveSection('project');
    } else if (p.length > 0) {
      setActiveProjectIdState(p[0].id);
      await setActiveProjectId(p[0].id);
      setActiveSection('project');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSelectProject(projectId: string) {
    setActiveProjectIdState(projectId);
    await setActiveProjectId(projectId);
    setActiveSection('project');
    setActiveAgentId(undefined);
    setActiveSavedChatId(undefined);
    setMobilePanelVisible(false);
  }

  function handleSelectAgent(agentId: string) {
    setActiveAgentId(agentId);
    setActiveSection('agent');
    setActiveProjectIdState(undefined);
    setActiveSavedChatId(undefined);
    setMobilePanelVisible(false);
  }

  function handleSelectSavedChat(chatId: string) {
    setActiveSavedChatId(chatId);
    setActiveSection('saved');
    setActiveProjectIdState(undefined);
    setActiveAgentId(undefined);
    setMobilePanelVisible(false);
  }

  // Fix #2: real new project handler passed to sidebar
  async function handleNewProject() {
    setShowNewProjectModal(true);
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }
    const proj: Project = {
      id: uuidv4(),
      name: newProjectName.trim(),
      agents: DEFAULT_AGENTS.map(a => a.id),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
    };
    await saveProject(proj);
    setNewProjectName('');
    setShowNewProjectModal(false);
    await loadData(); // Fix #8: reload so sidebar list updates
    await handleSelectProject(proj.id);
  }

  async function handleCreateAgent() {
    if (!agentName.trim() || !agentRole.trim()) {
      Alert.alert('Error', 'Agent name and role are required');
      return;
    }
    const newAgent: SwarmAgent = {
      id: uuidv4(),
      name: agentName.trim(),
      color: 'custom',
      colorHex: agentColor,
      specialty: agentRole.trim(),
      personality: `Custom agent focused on ${agentRole.trim()}`,
      systemPrompt: `You are ${agentName.trim()}, a specialized AI agent in the Colour Ceauxdid multi-agent swarm.\nYour specialty: ${agentRole.trim()}\nWork collaboratively with Red, Blue, Green, Yellow, Purple.\nStay in character and contribute your unique perspective.`,
      isCustom: true,
      load: 0,
      status: 'idle',
    };
    await saveCustomAgent(newAgent);
    await loadData(); // Fix #8: reload so sidebar reflects new agent
    setAgentName('');
    setAgentRole('');
    setAgentColor(CUSTOM_AGENT_COLORS[0]);
    setShowCreateAgentModal(false);
    handleSelectAgent(newAgent.id);
  }

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeSavedChat = savedChats.find(c => c.id === activeSavedChatId);
  const allAgents = [...DEFAULT_AGENTS, ...customAgents];

  // Fix #6: mobile panel content by section
  const renderMobilePanel = () => {
    if (activeSection === 'project') {
      return (
        <FlatList
          data={projects}
          keyExtractor={p => p.id}
          ListEmptyComponent={
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>No projects yet</Text>
              <TouchableOpacity style={styles.emptyPanelBtn} onPress={() => { setMobilePanelVisible(false); setShowNewProjectModal(true); }}>
                <Text style={styles.emptyPanelBtnText}>+ Create Project</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.panelItem} onPress={() => handleSelectProject(item.id)}>
              <Text style={styles.panelItemText}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      );
    }
    if (activeSection === 'agent') {
      return (
        <ScrollView>
          {allAgents.map(a => (
            <TouchableOpacity key={a.id} style={styles.panelItem} onPress={() => handleSelectAgent(a.id)}>
              <View style={[styles.panelDot, { backgroundColor: a.colorHex }]} />
              <View>
                <Text style={styles.panelItemText}>{a.name}</Text>
                <Text style={styles.panelItemSub}>{a.specialty}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    if (activeSection === 'saved') {
      return (
        <FlatList
          data={savedChats}
          keyExtractor={c => c.id}
          ListEmptyComponent={<Text style={[styles.emptyPanelText, { padding: 24 }]}>No saved chats</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.panelItem} onPress={() => handleSelectSavedChat(item.id)}>
              <Text style={styles.panelItemText}>{item.name}</Text>
              <Text style={styles.panelItemSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
        />
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContainer}>
        {/* Sidebar: desktop only */}
        {isLargeScreen && (
          <View style={styles.sidebar}>
            <SidebarNavigation
              activeSection={activeSection}
              activeProjectId={activeProjectId}
              activeAgentId={activeAgentId}
              activeSavedChatId={activeSavedChatId}
              onSelectProject={handleSelectProject}
              onSelectAgent={handleSelectAgent}
              onSelectSavedChat={handleSelectSavedChat}
              onNewProject={handleNewProject}
              onCreateAgent={() => setShowCreateAgentModal(true)}
            />
          </View>
        )}

        {/* Main area */}
        <View style={styles.mainArea}>
          {/* Fix #6/#7: mobile header with section picker */}
          {!isLargeScreen && (
            <TouchableOpacity style={styles.mobileHeader} onPress={() => setMobilePanelVisible(true)}>
              <Text style={styles.mobileHeaderTitle}>
                {activeSection === 'project' && activeProject ? activeProject.name
                  : activeSection === 'agent' && activeAgentId ? allAgents.find(a => a.id === activeAgentId)?.name ?? 'Agent'
                  : activeSection === 'saved' && activeSavedChat ? activeSavedChat.name
                  : 'Tap to select...'}
              </Text>
              <Text style={styles.mobileHeaderChevron}>▾</Text>
            </TouchableOpacity>
          )}

          {activeSection === 'project' && activeProject ? (
            <ChatMainArea project={activeProject} mode="project" onDataChange={loadData} />
          ) : activeSection === 'agent' && activeAgentId ? (
            <ChatMainArea agentId={activeAgentId} mode="agent" onDataChange={loadData} />
          ) : activeSection === 'saved' && activeSavedChat ? (
            <ChatMainArea savedChat={activeSavedChat} mode="saved" onDataChange={loadData} />
          ) : (
            // Fix #7: first launch empty state with clear CTA
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>◈ Colour Ceauxdid</Text>
              <Text style={styles.emptyStateText}>Multi-agent AI orchestration</Text>
              <TouchableOpacity style={styles.emptyStateCTA} onPress={() => setShowNewProjectModal(true)}>
                <Text style={styles.emptyStateCTAText}>+ Create Your First Project</Text>
              </TouchableOpacity>
              <Text style={styles.emptyStateOr}>or chat with an agent directly</Text>
              <View style={styles.emptyAgentRow}>
                {DEFAULT_AGENTS.map(a => (
                  <TouchableOpacity key={a.id} style={[styles.emptyAgentBtn, { borderColor: a.colorHex }]} onPress={() => handleSelectAgent(a.id)}>
                    <Text style={[styles.emptyAgentText, { color: a.colorHex }]}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Mobile bottom tabs */}
      {!isLargeScreen && (
        <View style={styles.mobileTabs}>
          {(['project', 'agent', 'saved'] as const).map(section => (
            <TouchableOpacity
              key={section}
              style={[styles.mobileTab, activeSection === section && styles.activeTab]}
              onPress={() => { setActiveSection(section); setMobilePanelVisible(true); }}
            >
              <Text style={[styles.mobileTabText, activeSection === section && { color: COLORS.highlight }]}>
                {section === 'project' ? 'Projects' : section === 'agent' ? 'Agents' : 'Saved'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Fix #6: Mobile panel picker modal */}
      <Modal visible={mobilePanelVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.panelBackdrop} onPress={() => setMobilePanelVisible(false)} />
        <View style={styles.panelSheet}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelHeaderTitle}>
              {activeSection === 'project' ? 'Projects' : activeSection === 'agent' ? 'Agents' : 'Saved Chats'}
            </Text>
            {activeSection === 'project' && (
              <TouchableOpacity onPress={() => { setMobilePanelVisible(false); setShowNewProjectModal(true); }}>
                <Text style={styles.panelHeaderAction}>+ New</Text>
              </TouchableOpacity>
            )}
            {activeSection === 'agent' && (
              <TouchableOpacity onPress={() => { setMobilePanelVisible(false); setShowCreateAgentModal(true); }}>
                <Text style={styles.panelHeaderAction}>+ Create</Text>
              </TouchableOpacity>
            )}
          </View>
          {renderMobilePanel()}
        </View>
      </Modal>

      {/* New Project Modal */}
      <Modal visible={showNewProjectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Project</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Project name..."
              placeholderTextColor={COLORS.muted}
              value={newProjectName}
              onChangeText={setNewProjectName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowNewProjectModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleCreateProject}>
                <Text style={styles.primaryButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Agent Modal */}
      <Modal visible={showCreateAgentModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Custom Agent</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Agent name..."
              placeholderTextColor={COLORS.muted}
              value={agentName}
              onChangeText={setAgentName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Specialty / role..."
              placeholderTextColor={COLORS.muted}
              value={agentRole}
              onChangeText={setAgentRole}
            />
            <Text style={styles.colorLabel}>AGENT COLOR</Text>
            <View style={styles.colorRow}>
              {CUSTOM_AGENT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, agentColor === c && styles.colorDotSelected]}
                  onPress={() => setAgentColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowCreateAgentModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.primaryButton]} onPress={handleCreateAgent}>
                <Text style={styles.primaryButtonText}>Deploy</Text>
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
  mainContainer: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 280, backgroundColor: COLORS.darkBg },
  mainArea: { flex: 1 },
  mobileHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  mobileHeaderTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  mobileHeaderChevron: { color: COLORS.muted, fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyStateTitle: { color: COLORS.text, fontSize: 22, fontWeight: 'bold' },
  emptyStateText: { color: COLORS.muted, fontSize: 13 },
  emptyStateCTA: {
    marginTop: 8, backgroundColor: COLORS.highlight,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8,
  },
  emptyStateCTAText: { color: '#000', fontWeight: '700', fontSize: 14 },
  emptyStateOr: { color: COLORS.muted, fontSize: 12, marginTop: 8 },
  emptyAgentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  emptyAgentBtn: {
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  emptyAgentText: { fontSize: 12, fontWeight: '700' },
  mobileTabs: {
    flexDirection: 'row', backgroundColor: COLORS.darkBg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  mobileTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderTopWidth: 2, borderTopColor: COLORS.highlight },
  mobileTabText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  panelBackdrop: { flex: 1 },
  panelSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '60%', borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  panelHeaderTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  panelHeaderAction: { color: COLORS.highlight, fontSize: 13, fontWeight: '600' },
  panelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  panelDot: { width: 8, height: 8, borderRadius: 4 },
  panelItemText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  panelItemSub: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  emptyPanel: { padding: 24, alignItems: 'center', gap: 12 },
  emptyPanelText: { color: COLORS.muted, fontSize: 13 },
  emptyPanelBtn: {
    backgroundColor: COLORS.highlight,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6,
  },
  emptyPanelBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: COLORS.darkBg, borderRadius: 12,
    padding: 20, width: '85%', maxWidth: 400,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  modalInput: {
    backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, marginBottom: 12,
  },
  colorLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff' },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: {
    flex: 1, paddingVertical: 10, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalButtonText: { color: COLORS.text, textAlign: 'center', fontWeight: '600' },
  primaryButton: { backgroundColor: COLORS.highlight, borderColor: COLORS.highlight },
  primaryButtonText: { color: '#000', textAlign: 'center', fontWeight: '600' },
});
