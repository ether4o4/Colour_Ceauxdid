import type { Agent, GitRepo, Skill, AgentConfig } from '@/lib/index';

// ─── Mock Agents ───────────────────────────────────────────────────────────────
export const MOCK_AGENTS: Agent[] = [
  {
    id: 'agt-001',
    name: 'CodeReviewer',
    status: 'running',
    model: 'GPT-4o',
    uptime: '3d 14h',
    taskCount: 47,
    activeTask: 'Reviewing PR #142 in skywork-ui',
    skills: ['github', 'security-scanner', 'code-quality'],
    repoUrl: 'https://github.com/skywork/skywork-ui',
    repoBranch: 'main',
    configId: 'cfg-001',
    lastSeen: '2 sec ago',
    memoryUsage: 62,
    cpuUsage: 34,
    description: 'Automated code review agent with security scanning',
    envVars: {
      GITHUB_TOKEN: 'ghp_***',
      MAX_REVIEW_SIZE: '500',
      AUTO_MERGE: 'false',
    },
    logs: [
      { id: 'l1', timestamp: '14:22:01', level: 'info', message: 'Starting PR review for #142' },
      { id: 'l2', timestamp: '14:22:03', level: 'debug', message: 'Fetching diff from GitHub API' },
      { id: 'l3', timestamp: '14:22:05', level: 'info', message: 'Running security scan on 23 files' },
      { id: 'l4', timestamp: '14:22:12', level: 'warn', message: 'Potential XSS vulnerability found in auth.ts:45' },
      { id: 'l5', timestamp: '14:22:15', level: 'success', message: 'Review comment posted successfully' },
    ],
  },
  {
    id: 'agt-002',
    name: 'DataPipeline',
    status: 'running',
    model: 'Claude 3.5',
    uptime: '1d 6h',
    taskCount: 128,
    activeTask: 'Processing batch job #38 — analytics export',
    skills: ['data-processor', 'chart-generator', 'pdf-export'],
    repoUrl: 'https://github.com/skywork/data-pipeline',
    repoBranch: 'develop',
    configId: 'cfg-002',
    lastSeen: '12 sec ago',
    memoryUsage: 78,
    cpuUsage: 55,
    description: 'High-throughput data processing and visualization pipeline',
    envVars: {
      DB_URL: 'postgres://***',
      BATCH_SIZE: '1000',
      OUTPUT_FORMAT: 'parquet',
    },
    logs: [
      { id: 'l1', timestamp: '14:20:00', level: 'info', message: 'Batch job #38 started — 84,250 rows' },
      { id: 'l2', timestamp: '14:20:45', level: 'info', message: 'Stage 1/3: Data validation complete' },
      { id: 'l3', timestamp: '14:21:30', level: 'info', message: 'Stage 2/3: Transformations applied' },
      { id: 'l4', timestamp: '14:22:10', level: 'debug', message: 'Generating chart assets...' },
    ],
  },
  {
    id: 'agt-003',
    name: 'ResearchBot',
    status: 'idle',
    model: 'Gemini Pro',
    uptime: '5h 23m',
    taskCount: 9,
    skills: ['web-scraper', 'research', 'document-analyzer'],
    repoUrl: 'https://github.com/skywork/research-bot',
    repoBranch: 'main',
    lastSeen: '4 min ago',
    memoryUsage: 18,
    cpuUsage: 2,
    description: 'Web research and document analysis agent',
    envVars: {
      SEARCH_API_KEY: 'sk-***',
      MAX_PAGES: '50',
    },
    logs: [
      { id: 'l1', timestamp: '13:55:01', level: 'info', message: 'Research task completed: AI market 2026' },
      { id: 'l2', timestamp: '13:55:05', level: 'success', message: 'Report saved to /outputs/ai-market-2026.pdf' },
      { id: 'l3', timestamp: '13:55:10', level: 'info', message: 'Agent entering idle state' },
    ],
  },
  {
    id: 'agt-004',
    name: 'SecurityAuditor',
    status: 'error',
    model: 'DeepSeek R1',
    uptime: '0h 45m',
    taskCount: 3,
    activeTask: 'Dependency scan failed — rate limit exceeded',
    skills: ['security-scanner', 'snyk-integration'],
    configId: 'cfg-003',
    lastSeen: '1 min ago',
    memoryUsage: 5,
    cpuUsage: 0,
    description: 'Automated security auditing and vulnerability scanning',
    envVars: {
      SNYK_TOKEN: 'snyk-***',
      SEVERITY_THRESHOLD: 'high',
    },
    logs: [
      { id: 'l1', timestamp: '14:10:00', level: 'info', message: 'Starting security audit for repo skywork/api' },
      { id: 'l2', timestamp: '14:10:12', level: 'warn', message: 'Snyk API rate limit approaching (95/100)' },
      { id: 'l3', timestamp: '14:10:15', level: 'error', message: 'API rate limit exceeded — retry in 60s' },
      { id: 'l4', timestamp: '14:11:20', level: 'error', message: 'Retry failed — agent entering error state' },
    ],
  },
  {
    id: 'agt-005',
    name: 'DeployBot',
    status: 'stopped',
    model: 'Llama 3.3',
    uptime: '—',
    taskCount: 22,
    skills: ['azure-deploy', 'docker-build', 'k8s-operator'],
    repoUrl: 'https://github.com/skywork/deploy-bot',
    repoBranch: 'main',
    lastSeen: '2 hours ago',
    memoryUsage: 0,
    cpuUsage: 0,
    description: 'CI/CD automation and cloud deployment agent',
    envVars: {
      AZURE_CLIENT_ID: 'az-***',
      K8S_NAMESPACE: 'production',
    },
    logs: [
      { id: 'l1', timestamp: '12:00:00', level: 'info', message: 'Deployment to production complete — v2.4.1' },
      { id: 'l2', timestamp: '12:00:05', level: 'success', message: 'Health check passed on 3/3 pods' },
      { id: 'l3', timestamp: '12:01:00', level: 'info', message: 'Agent stopped gracefully' },
    ],
  },
];

// ─── Mock GitHub Repos ─────────────────────────────────────────────────────────
export const MOCK_REPOS: GitRepo[] = [
  {
    id: 'repo-001',
    name: 'skywork-ui',
    fullName: 'skywork/skywork-ui',
    description: 'Main UI component library for Skywork platform',
    private: false,
    language: 'TypeScript',
    stars: 1243,
    updatedAt: '2 hours ago',
    branches: ['main', 'develop', 'feat/agent-hub', 'fix/auth-flow'],
    defaultBranch: 'main',
    lastCommit: 'feat: add agent card component (#142)',
    appliedAgents: ['agt-001'],
  },
  {
    id: 'repo-002',
    name: 'data-pipeline',
    fullName: 'skywork/data-pipeline',
    description: 'High-throughput analytics data processing pipeline',
    private: true,
    language: 'Python',
    stars: 87,
    updatedAt: '30 min ago',
    branches: ['main', 'develop', 'feat/parquet-export'],
    defaultBranch: 'develop',
    lastCommit: 'fix: memory leak in batch processor',
    appliedAgents: ['agt-002'],
  },
  {
    id: 'repo-003',
    name: 'research-bot',
    fullName: 'skywork/research-bot',
    description: 'Autonomous web research and document intelligence agent',
    private: false,
    language: 'Python',
    stars: 412,
    updatedAt: '1 day ago',
    branches: ['main', 'feat/multi-source'],
    defaultBranch: 'main',
    lastCommit: 'chore: update search API integration',
    appliedAgents: ['agt-003'],
  },
  {
    id: 'repo-004',
    name: 'deploy-bot',
    fullName: 'skywork/deploy-bot',
    description: 'Azure + Kubernetes deployment automation',
    private: true,
    language: 'Go',
    stars: 56,
    updatedAt: '3 days ago',
    branches: ['main', 'feat/helm-charts'],
    defaultBranch: 'main',
    lastCommit: 'release: v2.4.1 — stable production release',
    appliedAgents: ['agt-005'],
  },
  {
    id: 'repo-005',
    name: 'agent-core',
    fullName: 'skywork/agent-core',
    description: 'Core MCP protocol implementation and agent runtime',
    private: false,
    language: 'TypeScript',
    stars: 2891,
    updatedAt: '5 hours ago',
    branches: ['main', 'v2', 'feat/streaming-tools'],
    defaultBranch: 'main',
    lastCommit: 'perf: reduce tool call latency by 40%',
    appliedAgents: [],
  },
];

// ─── Mock Skills ───────────────────────────────────────────────────────────────
export const MOCK_SKILLS: Skill[] = [
  { id: 'sk-001', name: 'GitHub Agent', description: 'Full GitHub API integration — PRs, issues, branches, webhooks', category: 'Dev Tools', version: '2.3.1', author: 'skywork', downloads: 84200, rating: 4.9, installed: true, tags: ['git', 'github', 'devops'], icon: 'SiGithub' },
  { id: 'sk-002', name: 'Security Scanner', description: 'Multi-layer vulnerability scanning — OWASP, Snyk, CVE database', category: 'Security', version: '1.8.0', author: 'snyk-inc', downloads: 42100, rating: 4.7, installed: true, tags: ['security', 'owasp', 'snyk'], icon: 'Shield' },
  { id: 'sk-003', name: 'Web Scraper', description: 'Adaptive parsing, JS rendering, rate limiting, proxy rotation', category: 'Research', version: '3.1.2', author: 'skywork', downloads: 31500, rating: 4.6, installed: true, tags: ['scraping', 'research', 'web'], icon: 'Globe' },
  { id: 'sk-004', name: 'Chart Generator', description: 'Dynamic BI visualizations — bar, line, pie, heatmap, treemap', category: 'Data', version: '2.0.4', author: 'viz-labs', downloads: 28700, rating: 4.5, installed: true, tags: ['charts', 'data', 'visualization'], icon: 'BarChart2' },
  { id: 'sk-005', name: 'PDF Intelligence', description: 'OCR, layout understanding, semantic search, batch processing', category: 'Data', version: '1.4.3', author: 'docai', downloads: 19800, rating: 4.4, installed: false, tags: ['pdf', 'ocr', 'documents'], icon: 'FileText' },
  { id: 'sk-006', name: 'Azure Deployer', description: 'Resource orchestration, RBAC, IaC, cost monitoring', category: 'Dev Tools', version: '4.0.1', author: 'azure-community', downloads: 37200, rating: 4.8, installed: false, tags: ['azure', 'cloud', 'deploy'], icon: 'Cloud' },
  { id: 'sk-007', name: 'Slack Notifier', description: 'Rich notifications, thread replies, interactive buttons', category: 'Communication', version: '1.2.0', author: 'integrations-hub', downloads: 55600, rating: 4.3, installed: false, tags: ['slack', 'notifications', 'messaging'], icon: 'MessageSquare' },
  { id: 'sk-008', name: 'Data Processor', description: 'High-throughput ETL pipelines, Parquet/CSV/JSON support', category: 'Data', version: '2.7.0', author: 'skywork', downloads: 24300, rating: 4.6, installed: true, tags: ['etl', 'data', 'pipeline'], icon: 'Database' },
  { id: 'sk-009', name: 'Code Quality', description: 'ESLint, SonarQube, complexity metrics, auto-fix suggestions', category: 'Dev Tools', version: '1.9.5', author: 'code-labs', downloads: 61800, rating: 4.7, installed: true, tags: ['linting', 'quality', 'code'], icon: 'CheckCircle' },
  { id: 'sk-010', name: 'Research Engine', description: 'Multi-source web research, citation tracking, summarization', category: 'Research', version: '2.1.0', author: 'skywork', downloads: 18200, rating: 4.5, installed: true, tags: ['research', 'search', 'ai'], icon: 'Search' },
  { id: 'sk-011', name: 'K8s Operator', description: 'Kubernetes deployment, scaling, pod management, health checks', category: 'Dev Tools', version: '3.2.1', author: 'k8s-community', downloads: 29100, rating: 4.8, installed: false, tags: ['kubernetes', 'k8s', 'containers'], icon: 'Layers' },
  { id: 'sk-012', name: 'Snyk Integration', description: 'Supply chain security, license risk, automated alerts', category: 'Security', version: '2.0.0', author: 'snyk-inc', downloads: 33400, rating: 4.6, installed: true, tags: ['snyk', 'supply-chain', 'security'], icon: 'Shield' },
];

// ─── Mock Configs ──────────────────────────────────────────────────────────────
export const MOCK_CONFIGS: AgentConfig[] = [
  {
    id: 'cfg-001',
    name: 'code-reviewer.json',
    format: 'json',
    appliedTo: ['agt-001'],
    updatedAt: '1 day ago',
    description: 'Code review agent configuration',
    content: `{
  "model": "gpt-4o",
  "max_tokens": 4096,
  "temperature": 0.2,
  "review": {
    "auto_comment": true,
    "severity_threshold": "medium",
    "max_files_per_pr": 50
  },
  "security": {
    "scan_enabled": true,
    "owasp_rules": true,
    "fail_on_critical": true
  }
}`,
  },
  {
    id: 'cfg-002',
    name: 'data-pipeline.yaml',
    format: 'yaml',
    appliedTo: ['agt-002'],
    updatedAt: '3 hours ago',
    description: 'Data pipeline processing configuration',
    content: `model: claude-3-5-sonnet
batch_size: 1000
max_retries: 3
output_format: parquet

pipeline:
  stages:
    - validate
    - transform
    - aggregate
    - export
  
storage:
  type: s3
  bucket: skywork-analytics
  prefix: pipeline/outputs/`,
  },
  {
    id: 'cfg-003',
    name: 'security-auditor.env',
    format: 'env',
    appliedTo: ['agt-004'],
    updatedAt: '2 days ago',
    description: 'Security auditor environment config',
    content: `MODEL=deepseek-r1
SEVERITY_THRESHOLD=high
SNYK_TOKEN=snyk_xxxxxxxxxxxx
SNYK_ORG=skywork
OWASP_ENABLED=true
CVE_DATABASE=nvd
SCAN_INTERVAL=3600
NOTIFY_ON_CRITICAL=true
SLACK_WEBHOOK=https://hooks.slack.com/xxx`,
  },
  {
    id: 'cfg-004',
    name: 'base-agent.json',
    format: 'json',
    appliedTo: [],
    updatedAt: '5 days ago',
    description: 'Default base configuration template for new agents',
    content: `{
  "model": "gpt-4o",
  "max_tokens": 2048,
  "temperature": 0.7,
  "tools": [],
  "memory": {
    "type": "short-term",
    "max_messages": 50
  },
  "logging": {
    "level": "info",
    "persist": true
  }
}`,
  },
];
