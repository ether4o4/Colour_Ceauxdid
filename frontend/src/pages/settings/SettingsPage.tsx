import { useState } from 'react';
import {
  Bell, Shield, Key, User, Palette, Server,
  ChevronRight, RefreshCw
} from 'lucide-react';
import { SiGithub, SiOpenai, SiAnthropic } from 'react-icons/si';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Layout } from '@/components/Layout';

type ModelProvider = 'openai' | 'anthropic' | 'google' | 'local';

const MODEL_PROVIDERS: { id: ModelProvider; label: string; models: string[]; connected: boolean }[] = [
  { id: 'openai', label: 'OpenAI', models: ['GPT-4o', 'GPT-4o mini', 'o3'], connected: true },
  { id: 'anthropic', label: 'Anthropic', models: ['Claude 3.5 Sonnet', 'Claude 3 Opus'], connected: true },
  { id: 'google', label: 'Google', models: ['Gemini Pro', 'Gemini Flash'], connected: false },
  { id: 'local', label: 'Local (Ollama)', models: ['Llama 3.3', 'DeepSeek R1', 'Mistral'], connected: true },
];

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [autoRestart, setAutoRestart] = useState(false);
  const [streamLogs, setStreamLogs] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  return (
    <Layout
      title="Settings"
      subtitle="Agent Hub v1.0"
    >
      <div className="px-4 pt-4 space-y-6 pb-8">
        {/* Profile */}
        <Section title="Profile">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              SK
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">skywork</div>
              <div className="text-[11px] text-muted-foreground font-mono">admin@skywork.ai</div>
            </div>
            <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 font-mono">
              Pro
            </Badge>
          </div>
        </Section>

        {/* Integrations */}
        <Section title="Integrations">
          {/* GitHub */}
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <SiGithub className="w-5 h-5 text-foreground" />
              <div className="flex-1">
                <div className="text-sm font-mono text-foreground">GitHub</div>
                <div className="text-[10px] text-muted-foreground">@skywork · 5 repos</div>
              </div>
              <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 font-mono">
                ● connected
              </Badge>
            </div>
          </div>

          {/* Model Providers */}
          <div className="space-y-2 mt-3">
            <div className="text-[10px] text-muted-foreground font-mono uppercase px-1">Model Providers</div>
            {MODEL_PROVIDERS.map(provider => (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--muted)' }}>
                  {provider.id === 'openai' && <SiOpenai className="w-4 h-4 text-foreground" />}
                  {provider.id === 'anthropic' && <SiAnthropic className="w-4 h-4 text-foreground" />}
                  {provider.id === 'google' && <Server className="w-4 h-4 text-foreground" />}
                  {provider.id === 'local' && <Server className="w-4 h-4 text-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-foreground">{provider.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {provider.models.join(' · ')}
                  </div>
                </div>
                {provider.connected ? (
                  <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 font-mono flex-shrink-0">
                    ●
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground flex-shrink-0 cursor-pointer">
                    Connect
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <div className="rounded-xl overflow-hidden divide-y"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
            {[
              {
                icon: <Bell className="w-4 h-4" />,
                label: 'Push Notifications',
                sub: 'Agent status & error alerts',
                value: notifications,
                onChange: setNotifications,
              },
              {
                icon: <RefreshCw className="w-4 h-4" />,
                label: 'Auto-Restart on Error',
                sub: 'Restart crashed agents automatically',
                value: autoRestart,
                onChange: setAutoRestart,
              },
              {
                icon: <Server className="w-4 h-4" />,
                label: 'Stream Logs',
                sub: 'Real-time log streaming in terminal view',
                value: streamLogs,
                onChange: setStreamLogs,
              },
              {
                icon: <Palette className="w-4 h-4" />,
                label: 'Compact Mode',
                sub: 'Denser card layout for agent list',
                value: compactMode,
                onChange: setCompactMode,
              },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-muted-foreground">{item.icon}</div>
                <div className="flex-1">
                  <div className="text-sm text-foreground">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                </div>
                <Switch checked={item.value} onCheckedChange={item.onChange} />
              </div>
            ))}
          </div>
        </Section>

        {/* Security */}
        <Section title="Security">
          <div className="rounded-xl overflow-hidden divide-y"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
            {[
              { icon: <Key className="w-4 h-4" />, label: 'API Keys', sub: 'Manage agent API keys' },
              { icon: <Shield className="w-4 h-4" />, label: 'Permissions', sub: 'Role-based access control' },
              { icon: <User className="w-4 h-4" />, label: 'Audit Log', sub: 'View all agent actions' },
            ].map(item => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="text-muted-foreground">{item.icon}</div>
                <div className="flex-1">
                  <div className="text-sm text-foreground">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="rounded-xl px-4 py-3 space-y-2"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            {[
              { label: 'Version', value: '1.0.0' },
              { label: 'MCP Protocol', value: 'v2.3' },
              { label: 'Runtime', value: 'Node 22 LTS' },
              { label: 'Agents Supported', value: '50+' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">{row.label}</span>
                <span className="text-xs font-mono text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest px-1">
        {title}
      </h3>
      {children}
    </div>
  );
}
