import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Star, Lock, Globe, GitBranch, GitCommit, ChevronDown,
  ChevronRight, RefreshCw, Check, Search, Bot, Download
} from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';
import { MOCK_REPOS, MOCK_AGENTS } from '@/data/index';
import { cn } from '@/lib/utils';
import type { GitRepo } from '@/lib/index';

const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-400',
  Python: 'bg-yellow-400',
  Go: 'bg-cyan-400',
  Rust: 'bg-orange-400',
  JavaScript: 'bg-yellow-300',
};

export default function GitHubPage() {
  const [search, setSearch] = useState('');
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [pulledRepos, setPulledRepos] = useState<Set<string>>(new Set(['repo-001', 'repo-002', 'repo-003']));
  const [pullingRepo, setPullingRepo] = useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({});

  const repos = MOCK_REPOS.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const handlePull = (repoId: string) => {
    setPullingRepo(repoId);
    setTimeout(() => {
      setPulledRepos(prev => new Set([...prev, repoId]));
      setPullingRepo(null);
    }, 1800);
  };

  const getSelectedBranch = (repo: GitRepo) =>
    selectedBranches[repo.id] ?? repo.defaultBranch;

  return (
    <Layout
      title="GitHub"
      subtitle="Repositories & Branches"
      headerRight={
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </Button>
      }
    >
      <div className="px-4 pt-4 space-y-4">
        {/* Connected account banner */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <SiGithub className="w-5 h-5 text-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-foreground">skywork</div>
            <div className="text-[10px] text-muted-foreground">{MOCK_REPOS.length} repositories · Connected</div>
          </div>
          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 font-mono">
            ● authenticated
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Repos', value: MOCK_REPOS.length },
            { label: 'Pulled', value: pulledRepos.size },
            { label: 'Active', value: MOCK_REPOS.filter(r => r.appliedAgents.length > 0).length },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg p-3 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="text-2xl font-bold font-mono text-foreground">{stat.value}</div>
              <div className="text-[10px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm font-mono bg-card border-border/60"
          />
        </div>

        {/* Repo List */}
        <div className="space-y-2 pb-4">
          {repos.map((repo, i) => {
            const isExpanded = expandedRepo === repo.id;
            const isPulled = pulledRepos.has(repo.id);
            const isPulling = pullingRepo === repo.id;
            const agentsOnRepo = MOCK_AGENTS.filter(a => repo.appliedAgents.includes(a.id));

            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {/* Repo Header */}
                <button
                  className="w-full px-4 py-3 flex items-start gap-3 text-left"
                  onClick={() => setExpandedRepo(isExpanded ? null : repo.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {repo.private ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm font-mono font-semibold text-foreground truncate">
                        {repo.fullName}
                      </span>
                    </div>
                    {repo.description && (
                      <p className="text-[11px] text-muted-foreground truncate mb-2">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className={cn('w-2 h-2 rounded-full', LANG_COLORS[repo.language] ?? 'bg-muted-foreground')} />
                        <span className="text-[10px] text-muted-foreground font-mono">{repo.language}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-mono">{repo.stars.toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">{repo.updatedAt}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    {isPulled ? (
                      <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 font-mono h-6">
                        <Check className="w-2.5 h-2.5 mr-1" /> pulled
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] font-mono"
                        onClick={e => { e.stopPropagation(); handlePull(repo.id); }}
                        disabled={isPulling}
                      >
                        {isPulling ? (
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <><Download className="w-2.5 h-2.5 mr-1" /> pull</>
                        )}
                      </Button>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 pb-4 space-y-4"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    {/* Branches */}
                    <div className="pt-3">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Branches</div>
                      <div className="flex flex-wrap gap-1.5">
                        {repo.branches.map(branch => (
                          <button
                            key={branch}
                            onClick={() => setSelectedBranches(p => ({ ...p, [repo.id]: branch }))}
                            className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono transition-all',
                              getSelectedBranch(repo) === branch
                                ? 'bg-primary/20 text-primary border border-primary/40'
                                : 'bg-muted text-muted-foreground border border-border/40 hover:text-foreground'
                            )}
                          >
                            <GitBranch className="w-2.5 h-2.5" />
                            {branch}
                            {branch === repo.defaultBranch && (
                              <span className="text-[8px] text-muted-foreground ml-0.5">default</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Last commit */}
                    <div className="flex items-start gap-2">
                      <GitCommit className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] font-mono text-muted-foreground">{repo.lastCommit}</span>
                    </div>

                    {/* Applied agents */}
                    {agentsOnRepo.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Active Agents</div>
                        <div className="space-y-1">
                          {agentsOnRepo.map(agent => (
                            <div key={agent.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                              style={{ background: 'var(--muted)' }}>
                              <Bot className="w-3 h-3 text-primary" />
                              <span className="text-[11px] font-mono text-foreground">{agent.name}</span>
                              <div className="w-1.5 h-1.5 rounded-full ml-auto"
                                style={{ background: agent.status === 'running' ? '#4ade80' : 'var(--muted-foreground)' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
