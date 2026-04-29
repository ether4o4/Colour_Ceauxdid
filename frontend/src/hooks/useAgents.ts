import { useState, useCallback } from 'react';
import type { Agent, AgentStatus } from '@/lib/index';
import { MOCK_AGENTS } from '@/data/index';

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);

  const updateAgentStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents(prev =>
      prev.map(a => a.id === id ? { ...a, status, lastSeen: 'just now' } : a)
    );
  }, []);

  const deleteAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  }, []);

  const addAgent = useCallback((agent: Agent) => {
    setAgents(prev => [agent, ...prev]);
  }, []);

  const updateAgent = useCallback((id: string, updates: Partial<Agent>) => {
    setAgents(prev =>
      prev.map(a => a.id === id ? { ...a, ...updates } : a)
    );
  }, []);

  const runningCount = agents.filter(a => a.status === 'running').length;
  const errorCount = agents.filter(a => a.status === 'error').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

  return { agents, updateAgentStatus, deleteAgent, addAgent, updateAgent, runningCount, errorCount, idleCount };
}
