import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MoreVertical, Play, Square, RotateCw, Trash2, ChevronRight,
  GitBranch, Zap, Terminal
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, MetricBar } from '@/components/Layout';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { Agent, AgentStatus } from '@/lib/index';

interface AgentCardProps {
  agent: Agent;
  onStatusChange: (id: string, status: AgentStatus) => void;
  onDelete: (id: string) => void;
}

export function AgentCard({ agent, onStatusChange, onDelete }: AgentCardProps) {
  const navigate = useNavigate();
  const isRunning = agent.status === 'running';
  const isError = agent.status === 'error';

  const _borderColor = isRunning
    ? 'border-l-green-500'
    : isError
      ? 'border-l-red-500'
      : agent.status === 'idle'
        ? 'border-l-yellow-500'
        : 'border-l-muted-foreground/30';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="rounded-xl p-4 cursor-pointer select-none active:scale-[0.99] transition-transform"
      style={{
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${isRunning ? '#4ade80' : isError ? '#f87171' : agent.status === 'idle' ? '#facc15' : 'var(--border)'}`,
        boxShadow: isRunning
          ? '0 2px 16px -4px rgba(74,222,128,0.12)'
          : isError
            ? '0 2px 16px -4px rgba(248,113,113,0.12)'
            : '0 1px 8px -2px rgba(0,0,0,0.25)',
      }}
      onClick={() => navigate(ROUTE_PATHS.AGENTS + '/' + agent.id)}
    >
      {/* Row 1: Name + Status + Menu */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--muted)' }}>
            <Terminal className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{agent.name}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{agent.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <StatusBadge status={agent.status} size="sm" />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              onClick={e => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {agent.status !== 'running' && (
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onStatusChange(agent.id, 'running'); }}>
                  <Play className="w-3.5 h-3.5 mr-2 text-green-400" /> Start
                </DropdownMenuItem>
              )}
              {agent.status === 'running' && (
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onStatusChange(agent.id, 'stopped'); }}>
                  <Square className="w-3.5 h-3.5 mr-2 text-red-400" /> Stop
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onStatusChange(agent.id, 'idle'); }}>
                <RotateCw className="w-3.5 h-3.5 mr-2 text-yellow-400" /> Restart
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={e => { e.stopPropagation(); onDelete(agent.id); }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Model + Repo */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">{agent.model}</span>
        </div>
        {agent.repoUrl && (
          <div className="flex items-center gap-1 min-w-0">
            <GitBranch className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-[11px] font-mono text-muted-foreground truncate">
              {agent.repoUrl.replace('https://github.com/', '')}
              {agent.repoBranch && <span className="text-primary">#{agent.repoBranch}</span>}
            </span>
          </div>
        )}
      </div>

      {/* Active Task */}
      {agent.activeTask && (
        <div className="mb-3 px-2 py-1.5 rounded-md text-[11px] font-mono text-muted-foreground truncate"
          style={{ background: 'var(--muted)' }}>
          <span className="text-primary mr-1">{'>'}</span>
          {agent.activeTask}
        </div>
      )}

      {/* Resource Bars */}
      {agent.status !== 'stopped' && (
        <div className="space-y-1.5 mb-3">
          <MetricBar label="CPU" value={agent.cpuUsage} />
          <MetricBar label="MEM" value={agent.memoryUsage} />
        </div>
      )}

      {/* Footer: Stats */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            <span className="text-foreground font-semibold">{agent.taskCount}</span> tasks
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            ⏱ {agent.uptime}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {agent.skills.slice(0, 2).map(s => (
            <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono border-border/60">
              {s}
            </Badge>
          ))}
          {agent.skills.length > 2 && (
            <span className="text-[9px] text-muted-foreground font-mono">+{agent.skills.length - 2}</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-1" />
        </div>
      </div>
    </motion.div>
  );
}
