import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Copy, CheckCheck, FileJson, FileCode2, FileTerminal,
  Bot, Pencil, Trash2, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Layout } from '@/components/Layout';
import { MOCK_CONFIGS, MOCK_AGENTS } from '@/data/index';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/index';

const FORMAT_ICONS: Record<AgentConfig['format'], React.ReactNode> = {
  json: <FileJson className="w-4 h-4 text-yellow-400" />,
  yaml: <FileCode2 className="w-4 h-4 text-blue-400" />,
  env: <FileTerminal className="w-4 h-4 text-green-400" />,
};

const FORMAT_COLORS: Record<AgentConfig['format'], string> = {
  json: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  yaml: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  env: 'text-green-400 bg-green-400/10 border-green-400/20',
};

export default function ConfigsPage() {
  const [configs, setConfigs] = useState(MOCK_CONFIGS);
  const [selected, setSelected] = useState<AgentConfig | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = (id: string) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const getAppliedAgents = (cfg: AgentConfig) =>
    MOCK_AGENTS.filter(a => cfg.appliedTo.includes(a.id));

  return (
    <Layout
      title="Configurations"
      subtitle={`${configs.length} configs`}
      headerRight={
        <Button size="sm" className="h-8 gap-1.5 text-xs font-mono">
          <Plus className="w-3.5 h-3.5" /> New
        </Button>
      }
    >
      <div className="px-4 pt-4 space-y-3 pb-4">
        {configs.map((cfg, i) => {
          const agents = getAppliedAgents(cfg);
          return (
            <motion.div
              key={cfg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              {/* Header */}
              <button
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
                onClick={() => setSelected(cfg)}
              >
                <div className="flex-shrink-0">
                  {FORMAT_ICONS[cfg.format]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-mono font-semibold text-foreground truncate">
                      {cfg.name}
                    </span>
                    <Badge variant="outline"
                      className={cn('text-[9px] px-1.5 h-4 border', FORMAT_COLORS[cfg.format])}>
                      .{cfg.format}
                    </Badge>
                  </div>
                  {cfg.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{cfg.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-muted-foreground">Updated {cfg.updatedAt}</span>
                    {agents.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Bot className="w-2.5 h-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{agents.length} agent{agents.length > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>

              {/* Applied agents */}
              {agents.length > 0 && (
                <div className="px-4 pb-3 flex gap-1.5 flex-wrap"
                  style={{ borderTop: '1px solid var(--border)' }}>
                  {agents.map(agent => (
                    <div key={agent.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono mt-2"
                      style={{ background: 'var(--muted)' }}>
                      <div className="w-1.5 h-1.5 rounded-full"
                        style={{ background: agent.status === 'running' ? '#4ade80' : 'var(--muted-foreground)' }} />
                      {agent.name}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Config Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-[360px] w-full mx-4 rounded-2xl p-0 overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <DialogHeader className="px-4 py-3 flex-row items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <DialogTitle className="text-sm font-mono flex items-center gap-2">
              {selected && FORMAT_ICONS[selected.format]}
              {selected?.name}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => selected && handleCopy(selected.content)}>
                {copied
                  ? <CheckCheck className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => selected && handleDelete(selected.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </DialogHeader>

          <div className="overflow-auto max-h-80"
            style={{ background: '#0a0a0f' }}>
            <pre className="p-4 text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap break-all">
              {selected?.content}
            </pre>
          </div>

          {selected && getAppliedAgents(selected).length > 0 && (
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="text-[10px] text-muted-foreground font-mono uppercase mb-2">Applied to</div>
              <div className="flex flex-wrap gap-1.5">
                {getAppliedAgents(selected).map(agent => (
                  <Badge key={agent.id} variant="outline" className="text-[10px] font-mono">
                    {agent.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
