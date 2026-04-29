import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bot, GitBranch, Puzzle, FileCode2, Settings, Wifi } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  agentStats?: { running: number; total: number; errors: number };
}

const NAV_ITEMS = [
  { path: ROUTE_PATHS.AGENTS, icon: Bot, label: 'Agents' },
  { path: ROUTE_PATHS.GITHUB, icon: GitBranch, label: 'GitHub' },
  { path: ROUTE_PATHS.SKILLS, icon: Puzzle, label: 'Skills' },
  { path: ROUTE_PATHS.CONFIGS, icon: FileCode2, label: 'Configs' },
  { path: ROUTE_PATHS.SETTINGS, icon: Settings, label: 'Settings' },
];

export function Layout({ children, title, subtitle, headerRight, agentStats }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col dark">
      {/* Top Header */}
      {title && (
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14"
          style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--sidebar-border)' }}>
          <div className="flex flex-col justify-center">
            <span className="text-sm font-semibold text-foreground tracking-tight">{title}</span>
            {subtitle && <span className="text-[11px] text-muted-foreground font-mono">{subtitle}</span>}
          </div>
          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      {/* VS Code-style status bar */}
      <div
        className="fixed bottom-16 left-0 right-0 z-30 flex items-center justify-between px-4 h-6 text-[11px] font-mono"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3" />
            Connected
          </span>
          {agentStats && (
            <>
              <span className="opacity-60">|</span>
              <span>
                <span className="text-green-300 font-semibold">{agentStats.running}</span>
                <span className="opacity-70">/{agentStats.total} running</span>
              </span>
              {agentStats.errors > 0 && (
                <>
                  <span className="opacity-60">|</span>
                  <span className="text-red-300">{agentStats.errors} errors</span>
                </>
              )}
            </>
          )}
        </div>
        <span className="opacity-70">Agent Hub v1.0</span>
      </div>

      {/* Bottom Tab Navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-16 px-2"
        style={{
          background: 'var(--sidebar)',
          borderTop: '1px solid var(--sidebar-border)',
        }}
      >
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
          return (
            <NavLink
              key={path}
              to={path}
              className="flex flex-col items-center justify-center gap-0.5 w-14 h-full"
            >
              <div
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-primary/20 text-primary scale-105'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5 transition-all', isActive && 'drop-shadow-sm')} strokeWidth={isActive ? 2.5 : 2} />
                <span
                  className={cn(
                    'text-[10px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
import type { AgentStatus } from '@/lib/index';

interface StatusBadgeProps {
  status: AgentStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string; dot: string }> = {
  running: { color: 'text-green-400', label: 'Running', dot: 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' },
  idle: { color: 'text-yellow-400', label: 'Idle', dot: 'bg-yellow-400' },
  error: { color: 'text-red-400', label: 'Error', dot: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]' },
  stopped: { color: 'text-muted-foreground', label: 'Stopped', dot: 'bg-muted-foreground' },
};

export function StatusBadge({ status, showLabel = true, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className={cn('flex items-center gap-1.5', cfg.color)}>
      <div className={cn('rounded-full flex-shrink-0', cfg.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      {showLabel && (
        <span className={cn('font-medium', size === 'sm' ? 'text-[10px]' : 'text-xs')}>
          {cfg.label}
        </span>
      )}
    </div>
  );
}

// ─── Metric Bar ────────────────────────────────────────────────────────────────
interface MetricBarProps {
  label: string;
  value: number;
  max?: number;
}

export function MetricBar({ label, value, max = 100 }: MetricBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct > 80 ? 'bg-red-400' : pct > 60 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground font-mono w-7">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  );
}
