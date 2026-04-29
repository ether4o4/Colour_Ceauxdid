import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Play, Square, RotateCw, Trash2, Terminal,
  Copy, CheckCheck, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout, StatusBadge, MetricBar } from '@/components/Layout';
import { useAgents } from '@/hooks/useAgents';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/lib/index';

const LOG_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-muted-foreground',
  success: 'text-green-400',
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { agents, updateAgentStatus, deleteAgent } = useAgents();
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const agent = agents.find(a => a.id === id);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agent?.logs]);

  if (!agent) {
    return (
      <Layout title="Not Found">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Agent not found</p>
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTE_PATHS.AGENTS)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>
      </Layout>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    deleteAgent(agent.id);
    navigate(ROUTE_PATHS.AGENTS);
  };

  return (
    <Layout
      title={agent.name}
      subtitle={`${agent.model} · ${agent.id}`}
      headerRight={
        <div className="flex items-center gap-2">
          {agent.status !== 'running' && (
            <Button size="sm" className="h-7 gap-1 text-xs font-mono"
              onClick={() => updateAgentStatus(agent.id, 'running')}>
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {agent.status === 'running' && (
            <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs font-mono"
              onClick={() => updateAgentStatus(agent.id, 'stopped')}>
              <Square className="w-3 h-3" /> Stop
            </Button>
          )}
        </div>
      }
    >
      <div className="px-4 pt-4 space-y-4">
        {/* Back button */}
        <button
          onClick={() => navigate(ROUTE_PATHS.AGENTS)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to agents
        </button>

        {/* Status Card */}
        <div className="rounded-xl p-4 space-y-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <StatusBadge status={agent.status} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => updateAgentStatus(agent.id, 'idle')}>
                <RotateCw className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold font-mono text-foreground">{agent.taskCount}</div>
              <div className="text-[10px] text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center border-x border-border/50">
              <div className="text-lg font-bold font-mono text-foreground">{agent.uptime}</div>
              <div className="text-[10px] text-muted-foreground">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold font-mono text-foreground">{agent.skills.length}</div>
              <div className="text-[10px] text-muted-foreground">Skills</div>
            </div>
          </div>

          <div className="space-y-2">
            <MetricBar label="CPU" value={agent.cpuUsage} />
            <MetricBar label="MEM" value={agent.memoryUsage} />
          </div>

          {agent.activeTask && (
            <div className="px-3 py-2 rounded-lg text-xs font-mono"
              style={{ background: 'var(--muted)' }}>
              <span className="text-primary">$ </span>
              <span className="text-muted-foreground">{agent.activeTask}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="logs">
          <TabsList className="w-full grid grid-cols-4 h-9 text-xs">
            <TabsTrigger value="logs" className="font-mono text-xs">Logs</TabsTrigger>
            <TabsTrigger value="skills" className="font-mono text-xs">Skills</TabsTrigger>
            <TabsTrigger value="config" className="font-mono text-xs">Config</TabsTrigger>
            <TabsTrigger value="env" className="font-mono text-xs">Env</TabsTrigger>
          </TabsList>

          {/* ─── Logs Tab ─── */}
          <TabsContent value="logs" className="mt-3">
            <div className="rounded-xl overflow-hidden"
              style={{ background: '#0a0a0f', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground">{agent.name} · stdout</span>
                </div>
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
              </div>
              <div className="p-3 space-y-1 min-h-32 max-h-64 overflow-y-auto">
                {agent.logs.map((log, i) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex gap-2 text-[11px] font-mono leading-relaxed"
                  >
                    <span className="text-muted-foreground/50 flex-shrink-0">{log.timestamp}</span>
                    <span className={cn('uppercase text-[9px] flex-shrink-0 mt-px font-bold', LOG_COLORS[log.level])}>
                      [{log.level}]
                    </span>
                    <span className="text-gray-300 break-all">{log.message}</span>
                  </motion.div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </TabsContent>

          {/* ─── Skills Tab ─── */}
          <TabsContent value="skills" className="mt-3">
            <div className="space-y-2">
              {agent.skills.map(skill => (
                <div key={skill}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded flex items-center justify-center"
                      style={{ background: 'var(--muted)' }}>
                      <Zap className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm font-mono text-foreground">{skill}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">
                    active
                  </Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full h-9 text-xs font-mono border-dashed mt-2"
                onClick={() => navigate(ROUTE_PATHS.SKILLS)}>
                + Install more skills
              </Button>
            </div>
          </TabsContent>

          {/* ─── Config Tab ─── */}
          <TabsContent value="config" className="mt-3">
            <div className="rounded-xl overflow-hidden"
              style={{ background: '#0a0a0f', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-mono text-muted-foreground">
                  {agent.configId ?? 'No config linked'}
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleCopy(agent.configId ?? '')}
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="p-3">
                {agent.configId ? (
                  <p className="text-xs font-mono text-muted-foreground">
                    Config <span className="text-primary">{agent.configId}</span> is linked.{' '}
                    <button className="text-primary underline" onClick={() => navigate(ROUTE_PATHS.CONFIGS)}>
                      View in Configs →
                    </button>
                  </p>
                ) : (
                  <Button variant="outline" size="sm" className="text-xs font-mono border-dashed w-full"
                    onClick={() => navigate(ROUTE_PATHS.CONFIGS)}>
                    Link a configuration
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ─── Env Vars Tab ─── */}
          <TabsContent value="env" className="mt-3">
            <div className="rounded-xl overflow-hidden"
              style={{ background: '#0a0a0f', border: '1px solid var(--border)' }}>
              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-mono text-muted-foreground">.env vars</span>
              </div>
              <div className="p-3 space-y-2">
                {Object.entries(agent.envVars).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-blue-400 flex-shrink-0">{key}</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-yellow-300 truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
