import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ROUTE_PATHS } from "@/lib/index";
import AgentsPage from "@/pages/agents/AgentsPage";
import AgentDetailPage from "@/pages/agents/AgentDetailPage";
import NewAgentPage from "@/pages/agents/NewAgentPage";
import GitHubPage from "@/pages/github/GitHubPage";
import SkillsPage from "@/pages/skills/SkillsPage";
import ConfigsPage from "@/pages/configs/ConfigsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import NotFound from "@/pages/not-found/Index";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          {/* Redirect root to agents */}
          <Route path="/" element={<Navigate to={ROUTE_PATHS.AGENTS} replace />} />

          {/* Agents */}
          <Route path={ROUTE_PATHS.AGENTS} element={<AgentsPage />} />
          <Route path={ROUTE_PATHS.AGENT_DETAIL} element={<AgentDetailPage />} />
          <Route path={ROUTE_PATHS.AGENT_NEW} element={<NewAgentPage />} />

          {/* GitHub */}
          <Route path={ROUTE_PATHS.GITHUB} element={<GitHubPage />} />

          {/* Skills */}
          <Route path={ROUTE_PATHS.SKILLS} element={<SkillsPage />} />

          {/* Configs */}
          <Route path={ROUTE_PATHS.CONFIGS} element={<ConfigsPage />} />

          {/* Settings */}
          <Route path={ROUTE_PATHS.SETTINGS} element={<SettingsPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
