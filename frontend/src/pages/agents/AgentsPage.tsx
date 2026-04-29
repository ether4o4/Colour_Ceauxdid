import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Bot, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';
import { AgentCard } from '@/components/AgentCard';
import { useAgents } from '@/hooks/useAgents';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { AgentStatus } from '@/lib/index';

type FilterTab = 'all' | AgentStatus;

const FILTER_TABS: { key: FilterTab; label: string; color?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running', color: 'text-green-400' },
  { key: 'idle', label: 'Idle', color: 'text-yellow-400' },
  { key: 'error', label: 'Error', color: 'text-red-400' },
  { key: 'stopped', label: 'Stopped' },
];

export default function AgentsPage() {
  const navigate = useNavigate();
  const { agents, updateAgentStatus, deleteAgent, runningCount, errorCount, idleCount } = useAgents();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered = agents.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.model.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || a.status === filter;
    return matchesSearch && matchesFilter;
  });

  const counts: Record<FilterTab, number> = {
    all: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    idle: agents.filter(a => a.status === 'idle').length,
    error: agents.filter(a => a.status === 'error').length,
    stopped: agents.filter(a => a.status === 'stopped').length,
  };

  return (
    <Layout
      title="Agent Hub"
      subtitle={`${runningCount} running · ${errorCount} errors`}
      agentStats={{ running: runningCount, total: agents.length, errors: errorCount }}
      headerRight={
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs font-mono"
          onClick={() => navigate(ROUTE_PATHS.AGENT_NEW)}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
      }
    >
      <div className="px-4 pt-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm font-mono bg-card border-border/60 focus:border-primary/60"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all',
                filter === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <span>{tab.label}</span>
              <span className={cn(
                'text-[10px] rounded px-1',
                filter === tab.key ? 'bg-white/20' : 'bg-muted'
              )}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Running', value: runningCount, color: 'text-green-400' },
            { label: 'Errors', value: errorCount, color: 'text-red-400' },
            { label: 'Idle', value: idleCount, color: 'text-yellow-400' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg p-3 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className={cn('text-2xl font-bold font-mono', stat.color)}>{stat.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Agent list */}
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"
            >
              <Bot className="w-10 h-10 opacity-30" />
              <p className="text-sm">No agents found</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-mono"
                onClick={() => navigate(ROUTE_PATHS.AGENT_NEW)}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Deploy your first agent
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-3 pb-4">
              {filtered.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <AgentCard
                    agent={agent}
                    onStatusChange={updateAgentStatus}
                    onDelete={deleteAgent}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
