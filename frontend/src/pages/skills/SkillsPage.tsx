import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Download, Check, Star, Shield, Globe, Database,
  BarChart2, FileText, Cloud, MessageSquare, Layers, CheckCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout } from '@/components/Layout';
import { MOCK_SKILLS } from '@/data/index';
import { cn } from '@/lib/utils';
import type { Skill, SkillCategory } from '@/lib/index';

const SKILL_ICONS: Record<string, React.ReactNode> = {
  'SiGithub': <Globe className="w-4 h-4" />,
  'Shield': <Shield className="w-4 h-4" />,
  'Globe': <Globe className="w-4 h-4" />,
  'BarChart2': <BarChart2 className="w-4 h-4" />,
  'FileText': <FileText className="w-4 h-4" />,
  'Cloud': <Cloud className="w-4 h-4" />,
  'MessageSquare': <MessageSquare className="w-4 h-4" />,
  'Database': <Database className="w-4 h-4" />,
  'CheckCircle': <CheckCircle className="w-4 h-4" />,
  'Search': <Search className="w-4 h-4" />,
  'Layers': <Layers className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  'Dev Tools': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Security': 'text-red-400 bg-red-400/10 border-red-400/20',
  'Research': 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Data': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Communication': 'text-green-400 bg-green-400/10 border-green-400/20',
  'Productivity': 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
};

export default function SkillsPage() {
  const [search, setSearch] = useState('');
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_SKILLS.map(s => [s.id, s.installed]))
  );
  const [installing, setInstalling] = useState<string | null>(null);

  const handleToggle = (skillId: string) => {
    if (installedMap[skillId]) {
      setInstalledMap(prev => ({ ...prev, [skillId]: false }));
      return;
    }
    setInstalling(skillId);
    setTimeout(() => {
      setInstalledMap(prev => ({ ...prev, [skillId]: true }));
      setInstalling(null);
    }, 1500);
  };

  const filterSkills = (skills: Skill[]) =>
    skills.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    );

  const allFiltered = filterSkills(MOCK_SKILLS);
  const installedFiltered = filterSkills(MOCK_SKILLS.filter(s => installedMap[s.id]));
  const installedCount = Object.values(installedMap).filter(Boolean).length;

  return (
    <Layout
      title="Skills Marketplace"
      subtitle={`${installedCount} installed`}
    >
      <div className="px-4 pt-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm font-mono bg-card border-border/60"
          />
        </div>

        <Tabs defaultValue="all">
          <TabsList className="w-full grid grid-cols-2 h-9">
            <TabsTrigger value="all" className="text-xs font-mono">
              All ({allFiltered.length})
            </TabsTrigger>
            <TabsTrigger value="installed" className="text-xs font-mono">
              Installed ({installedFiltered.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            <SkillList
              skills={allFiltered}
              installedMap={installedMap}
              installing={installing}
              onToggle={handleToggle}
            />
          </TabsContent>

          <TabsContent value="installed" className="mt-3">
            {installedFiltered.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
                <Download className="w-8 h-8 opacity-30" />
                <p className="text-sm">No skills installed</p>
              </div>
            ) : (
              <SkillList
                skills={installedFiltered}
                installedMap={installedMap}
                installing={installing}
                onToggle={handleToggle}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

interface SkillListProps {
  skills: Skill[];
  installedMap: Record<string, boolean>;
  installing: string | null;
  onToggle: (id: string) => void;
}

function SkillList({ skills, installedMap, installing, onToggle }: SkillListProps) {
  return (
    <div className="space-y-2 pb-4">
      {skills.map((skill, i) => {
        const isInstalled = installedMap[skill.id];
        const isInstalling = installing === skill.id;

        return (
          <motion.div
            key={skill.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl p-4"
            style={{ background: 'var(--card)', border: `1px solid ${isInstalled ? 'var(--primary)' : 'var(--border)'}` }}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                isInstalled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {SKILL_ICONS[skill.icon] ?? <Globe className="w-4 h-4" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-foreground">{skill.name}</span>
                  <Badge variant="outline"
                    className={cn('text-[9px] px-1.5 h-4 border', CATEGORY_COLORS[skill.category])}>
                    {skill.category}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">{skill.description}</p>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                  <span>v{skill.version}</span>
                  <span className="flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    {skill.rating}
                  </span>
                  <span>{(skill.downloads / 1000).toFixed(0)}k</span>
                  <span>by {skill.author}</span>
                </div>
              </div>

              {/* Install button */}
              <Button
                size="sm"
                variant={isInstalled ? 'outline' : 'default'}
                className={cn(
                  'h-8 px-3 text-xs font-mono flex-shrink-0',
                  isInstalled && 'border-primary/40 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40'
                )}
                onClick={() => onToggle(skill.id)}
                disabled={isInstalling}
              >
                {isInstalling ? (
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Installing
                  </span>
                ) : isInstalled ? (
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3" /> Installed
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" /> Install
                  </span>
                )}
              </Button>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mt-3">
              {skill.tags.map(tag => (
                <span key={tag}
                  className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  #{tag}
                </span>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
