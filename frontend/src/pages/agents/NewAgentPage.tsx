import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Bot, Zap, GitBranch, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layout } from '@/components/Layout';
import { ROUTE_PATHS } from '@/lib/index';
import { MOCK_SKILLS } from '@/data/index';
import { cn } from '@/lib/utils';
import type { ModelType } from '@/lib/index';

const MODELS: ModelType[] = ['GPT-4o', 'Claude 3.5', 'Gemini Pro', 'Llama 3.3', 'DeepSeek R1', 'Mistral Large'];
const STEPS = ['Basic', 'Model', 'Skills', 'Repo', 'Review'];

export default function NewAgentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    model: 'GPT-4o' as ModelType,
    skills: [] as string[],
    repoUrl: '',
    repoBranch: 'main',
    envVars: '',
  });

  const installedSkills = MOCK_SKILLS.filter(s => s.installed);

  const toggleSkill = (skillId: string) => {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skillId)
        ? prev.skills.filter(s => s !== skillId)
        : [...prev.skills, skillId],
    }));
  };

  const handleCreate = () => {
    navigate(ROUTE_PATHS.AGENTS);
  };

  return (
    <Layout
      title="New Agent"
      subtitle={`Step ${step + 1}/${STEPS.length} · ${STEPS[step]}`}
      headerRight={
        <button
          onClick={() => navigate(ROUTE_PATHS.AGENTS)}
          className="text-xs text-muted-foreground hover:text-foreground font-mono"
        >
          Cancel
        </button>
      }
    >
      <div className="px-4 pt-4 pb-8">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'w-full h-1 rounded-full transition-all',
                  i < step
                    ? 'bg-primary cursor-pointer'
                    : i === step
                      ? 'bg-primary/60'
                      : 'bg-muted'
                )}
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Bot className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-semibold">Agent Identity</h2>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground">Agent Name *</Label>
                  <Input
                    placeholder="e.g. CodeReviewer"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="font-mono bg-card border-border/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground">Description</Label>
                  <Input
                    placeholder="What does this agent do?"
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    className="font-mono bg-card border-border/60"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Model */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-semibold">Select Model</h2>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {MODELS.map(model => (
                    <button
                      key={model}
                      onClick={() => setForm(p => ({ ...p, model }))}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-mono transition-all',
                        form.model === model
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground hover:border-border/80'
                      )}
                    >
                      {model}
                      {form.model === model && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Skills */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-semibold">Assign Skills</h2>
                  <Badge variant="outline" className="ml-auto font-mono text-xs">
                    {form.skills.length} selected
                  </Badge>
                </div>
                <div className="space-y-2">
                  {installedSkills.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => toggleSkill(skill.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                        form.skills.includes(skill.id)
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-card hover:border-border/80'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all',
                        form.skills.includes(skill.id)
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/30'
                      )}>
                        {form.skills.includes(skill.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-foreground">{skill.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{skill.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Repo */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-4">
                  <GitBranch className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-semibold">Link Repository</h2>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground">GitHub Repo URL</Label>
                  <Input
                    placeholder="https://github.com/org/repo"
                    value={form.repoUrl}
                    onChange={e => setForm(p => ({ ...p, repoUrl: e.target.value }))}
                    className="font-mono bg-card border-border/60 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground">Branch</Label>
                  <Input
                    placeholder="main"
                    value={form.repoBranch}
                    onChange={e => setForm(p => ({ ...p, repoBranch: e.target.value }))}
                    className="font-mono bg-card border-border/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono text-muted-foreground">Environment Variables (KEY=value, one per line)</Label>
                  <textarea
                    placeholder={'GITHUB_TOKEN=ghp_xxx\nMAX_FILES=50'}
                    value={form.envVars}
                    onChange={e => setForm(p => ({ ...p, envVars: e.target.value }))}
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{ background: '#0a0a0f', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-semibold">Review & Deploy</h2>
                </div>
                <div className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  {[
                    { label: 'Name', value: form.name || '—' },
                    { label: 'Model', value: form.model },
                    { label: 'Skills', value: `${form.skills.length} selected` },
                    { label: 'Repo', value: form.repoUrl || 'None' },
                    { label: 'Branch', value: form.repoBranch },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-mono">{row.label}</span>
                      <span className="text-xs font-mono text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full h-12 text-sm font-mono gap-2 mt-4"
                  onClick={handleCreate}
                  disabled={!form.name}
                >
                  <Bot className="w-4 h-4" />
                  Deploy Agent
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button
              variant="outline"
              className="flex-1 h-11 text-sm font-mono"
              onClick={() => setStep(s => s - 1)}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button
              className="flex-1 h-11 text-sm font-mono"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !form.name}
            >
              Next <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
