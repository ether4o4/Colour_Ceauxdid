import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ScrollView, Modal,
  TextInput, Alert,
} from 'react-native';
import { COLORS } from '../utils/theme';
import { Project, SavedChat, SwarmAgent } from '../types';
import { DEFAULT_AGENTS } from '../agents/config';
import {
  getProjects, saveProject, deleteProject, getSavedChats, deleteSavedChat,
  getExternalAssets, getCustomAgents,
} from '../store';
import { v4 as uuidv4 } from 'uuid';

interface SidebarNavigationProps {
  activeSection: 'project' | 'agent' | 'saved';
  activeProjectId?: string;
  activeAgentId?: string;
  activeSavedChatId?: string;
  onSelectProject: (projectId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSavedChat: (chatId: string) => void;
  onNewProject: () => void;
  onCreateAgent: () => void;
}

export default function SidebarNavigation({
  activeSection,
  activeProjectId,
  activeAgentId,
  activeSavedChatId,
  onSelectProject,
  onSelectAgent,
  onSelectSavedChat,
  onNewProject,
  onCreateAgent,
}: SidebarNavigationProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [customAgents, setCustomAgents] = useState<SwarmAgent[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [p, s, c] = await Promise.all([
      getProjects(),
      getSavedChats(),
      getCustomAgents(),
    ]);
    setProjects(p);
    setSavedChats(s);
    setCustomAgents(c);
  }

  async function handleCreateProject() {
    if (!projectName.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }
    const newProject: Project = {
      id: uuidv4(),
      name: projectName,
      agents: ['red', 'blue', 'green', 'yellow', 'purple'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
    };
    await saveProject(newProject);
    setProjects([...projects, newProject]);
    setProjectName('');
    setShowProjectModal(false);
    onSelectProject(newProject.id);
  }

  const assetOptions = [
    { label: 'GitHub', icon: '◐' },
    { label: 'GitLab', icon: '◑' },
    { label: 'Google Drive', icon: '☁' },
    { label: 'OneDrive', icon: '☁' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>◈ Colour Ceauxdid</Text>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setShowProjectModal(true)}>
            <Text style={styles.actionButtonText}>+ New Group Project</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onCreateAgent}>
            <Text style={styles.actionButtonText}>+ Create Custom Agent</Text>
          </TouchableOpacity>
        </View>

        {/* Connect Assets */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.assetButton}
            onPress={() => setShowAssetModal(true)}
          >
            <Text style={styles.assetLabel}>Connect Outside Assets ▼</Text>
          </TouchableOpacity>
        </View>

        {/* Current Projects */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Projects</Text>
          {projects.length === 0 ? (
            <Text style={styles.emptyText}>No projects yet</Text>
          ) : (
            projects.slice(0, 5).map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.listItem,
                  activeSection === 'project' && activeProjectId === p.id && styles.activeItem,
                ]}
                onPress={() => onSelectProject(p.id)}
              >
                <Text style={styles.listItemText}>{p.name}</Text>
              </TouchableOpacity>
            ))
          )}
          {projects.length > 5 && (
            <Text style={styles.expandText}>View All Projects ({projects.length})</Text>
          )}
        </View>

        {/* Individual Chats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Individual Chats</Text>
          {DEFAULT_AGENTS.map(agent => (
            <TouchableOpacity
              key={agent.id}
              style={[
                styles.listItem,
                activeSection === 'agent' && activeAgentId === agent.id && styles.activeItem,
              ]}
              onPress={() => onSelectAgent(agent.id)}
            >
              <View style={[styles.agentDot, { backgroundColor: agent.colorHex }]} />
              <View>
                <Text style={styles.listItemText}>{agent.name}</Text>
                <Text style={styles.agentRole}>{agent.specialty}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {customAgents.map(agent => (
            <TouchableOpacity
              key={agent.id}
              style={[
                styles.listItem,
                activeSection === 'agent' && activeAgentId === agent.id && styles.activeItem,
              ]}
              onPress={() => onSelectAgent(agent.id)}
            >
              <View style={[styles.agentDot, { backgroundColor: agent.colorHex }]} />
              <View>
                <Text style={styles.listItemText}>{agent.name}</Text>
                <Text style={styles.agentRole}>{agent.specialty}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Saved Chats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Chats</Text>
          {savedChats.length === 0 ? (
            <Text style={styles.emptyText}>No saved chats</Text>
          ) : (
            savedChats.slice(0, 4).map(chat => (
              <TouchableOpacity
                key={chat.id}
                style={[
                  styles.listItem,
                  activeSection === 'saved' && activeSavedChatId === chat.id && styles.activeItem,
                ]}
                onPress={() => onSelectSavedChat(chat.id)}
              >
                <Text style={styles.listItemText}>{chat.name}</Text>
                <Text style={styles.chatDate}>
                  {new Date(chat.createdAt).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))
          )}
          {savedChats.length > 4 && (
            <Text style={styles.expandText}>View All Saved Chats ({savedChats.length})</Text>
          )}
        </View>
      </ScrollView>

      {/* Bottom Profile */}
      <View style={styles.footer}>
        <View style={styles.profileContainer}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>👤</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>You</Text>
            <Text style={styles.profilePlan}>Premium Plan</Text>
          </View>
        </View>
      </View>

      {/* New Project Modal */}
      <Modal visible={showProjectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Project</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Project name..."
              placeholderTextColor={COLORS.muted}
              value={projectName}
              onChangeText={setProjectName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowProjectModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleCreateProject}
              >
                <Text style={styles.primaryButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Asset Connection Modal */}
      <Modal visible={showAssetModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connect Outside Assets</Text>
            {assetOptions.map((asset, i) => (
              <TouchableOpacity key={i} style={styles.assetOption}>
                <Text style={styles.assetIcon}>{asset.icon}</Text>
                <Text style={styles.assetOptionText}>{asset.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalButton, styles.primaryButton]}
              onPress={() => setShowAssetModal(false)}
            >
              <Text style={styles.primaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionButton: {
    backgroundColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  assetButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  assetLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  listItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 6,
    alignItems: 'center',
  },
  activeItem: {
    backgroundColor: COLORS.border,
  },
  listItemText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  agentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  agentRole: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  chatDate: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  expandText: {
    color: COLORS.highlight,
    fontSize: 12,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileAvatarText: {
    fontSize: 20,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  profilePlan: {
    color: COLORS.muted,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonText: {
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: COLORS.highlight,
    borderColor: COLORS.highlight,
  },
  primaryButtonText: {
    color: '#000',
    textAlign: 'center',
    fontWeight: '600',
  },
  assetOption: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  assetIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  assetOptionText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
