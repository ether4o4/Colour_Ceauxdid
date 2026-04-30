# Colour Ceauxdid — PRD & Change Log

## App summary
Colour Ceauxdid is a React Native / Expo multi-agent AI chat app. 5 built-in
color-coded agents (Red/Blue/Green/Yellow/Purple) plus up to 5 custom agents.
BYOK via OpenRouter or Ollama. All data persisted locally via AsyncStorage
(localStorage on web) — secrets live in expo-secure-store on native.
Runs on port 3000 via Expo Web in the preview environment.

## Tech stack
- React Native 0.81 + Expo 54
- React Navigation (bottom tabs + stack)
- AsyncStorage + expo-secure-store for persistence
- OpenRouter (hosted) + Ollama (local) via fetch streaming
- No backend

## Original problem statement (v1)
> The addiction of api keys or local models either one are not functional as well as
> a few other things, like when saving a configuration it doesn't seem persistent.
> Also: 1-on-1 per-color persistent chats separate from each other, group chats
> separate from 1-on-1s with group→1-on-1 memory flow, multiple API keys for
> simultaneous multi-agent use.

## v2.0 scope (this session)
User approved 5-batch feature expansion in order E → D → B → A → C:
- E. Secure-store for API keys (expo-secure-store, obfuscated web fallback)
- D. Cost/token ledger (per-chat footer, 30-day total in Settings)
- B. Agent-to-agent @-mention chaining in group chats (depth-capped at 3)
- A. Route-to menu on any message (Continue-in-DM, Ask another, Pin memory, Copy, Delete)
- C. Original 4: GitHub/Drive PAT integrations, inline modal errors, per-agent
     model/key pinning, real workflow step editor
- Bonus: slash commands (/plan /code /brainstorm /factcheck /remember /ask /swarm),
  JSON export/import backup, per-agent pinned-memory viewer.

## What's been implemented, with dates

### 2026-01 — v1.0 (previous session)
- Scope-aware message storage per 1-on-1 and per project
- API Keys CRUD UI with live validation against /auth/key
- Ollama local provider support
- Group→1-on-1 memory inheritance via buildContextForAgent
- Multi-key round-robin
- Project creation race fix
- Removed leaked hardcoded OpenRouter key from source
- 3 testing-agent iterations, 100% pass

### 2026-01 — v2.0 (this session)
- **E. Secure storage**: new `src/utils/secureStorage.ts` — expo-secure-store on
  native, xor+base64 obfuscated AsyncStorage on web. ApiKey now holds only a
  `secretKey` reference; actual secret lives under `cc_sec_apikey:<id>`.
  Migration converts any v1 plaintext secrets into secure store on first read.
- **D. Cost ledger**: `cc_usage_ledger` entries logged on every completion.
  OpenRouter streaming now requests `stream_options.include_usage:true` and
  falls back to `/generation?id=` for cost. Ollama derives tokens from
  `prompt_eval_count`/`eval_count`. Settings shows 30-day totals with
  per-chat footer in chat header.
- **B. @-mention chaining**: `extractAgentMentions` in `src/utils/commands.ts`.
  `streamAgentMessage(agent, text, chainDepth=0)` with `MAX_MENTION_CHAIN = 3`.
  Self-loop, non-member, and user-token filters prevent runaway chains.
- **A. Route menu**: new `src/components/MessageActionsMenu.tsx`. Tap any bubble
  opens an action sheet with Continue-in-DM, Ask-another, Pin-memory, Copy, Delete.
  Continue-in-DM flows through ChatHub.handleContinueInDm which sets a continuity
  banner on the target agent's 1-on-1. Pinned memories stored under
  `cc_pinned_memories` and auto-injected into that agent's system prompt on
  future calls.
- **C1. GitHub / Drive integrations** (`src/utils/integrations.ts`): PAT-based
  BYOK. `testGitHubToken` against `/user`, `testGoogleDriveToken` against
  `/drive/v3/about`. Tokens stored in secure-store under `cc_sec_asset:<id>`.
- **C2. Inline errors**: every modal now renders failures as red `<Text>`
  inside the modal. No more `Alert.alert` for validation.
- **C3. Per-agent model/key pinning**: `CoreAgentPrefs` store. Settings
  "PER-AGENT MODEL PINNING" section opens a per-agent modal to pick model
  + API key. Agent-level pinning overrides global default in
  `resolveAgentProviderAndModel`.
- **C4. Workflow editor**: real step cards in Settings → WORKFLOWS. Each step
  has agent chips (R/B/G/Y/P) + instruction text + delete. Inline validation
  errors. Steps persist in `cc_workflows`.
- **Bonus — Slash commands**: typing `/` shows inline dropdown; full reference
  modal in chat ⋮ menu. `/remember <fact>` auto-pins to Purple's memory.
- **Bonus — JSON backup**: Settings → Backup & Restore. Export triggers web
  file download or native Share sheet. Import pastes JSON and restores all
  except secrets (by design).
- **Bonus — Pinned-memory viewer**: AgentsScreen core cards tappable; modal
  lists pinned memories for that agent with remove button and mem count badge.

## Testing
- Iteration 4 (v2.0): all graded items PASS. Zero bugs found.
- Test reports: `/app/test_reports/iteration_{1..4}.json`

## Known minor (non-blocking)
- Web xor+b64 secret obfuscation is NOT cryptographic — documented explicitly.
  Real web security would need WebCrypto + passphrase (separate flow).
- Google Drive OAuth tokens from OAuth Playground are short-lived (~1h).
  A proper refresh-token flow is a future task if Drive becomes heavily used.
- Workflow runtime (one-click execute of a saved workflow) not yet built; this
  iteration implemented the EDITOR. Runtime is a natural next step.

## Security action required BY USER
- Rotate both OpenRouter keys that were exposed in previous session:
  - `sk-or-v1-0497a19ada...1386` (public GitHub history)
  - `sk-or-v1-a58c8342de...5824` (shared in chat)
  Replace with fresh keys via Settings → API Keys.

## Prioritized backlog / next
- P1 Workflow RUN button + progress UI (editor is done, runner is not)
- P2 Voice input (Whisper via OpenAI key)
- P2 Image attachments (vision-capable models via OpenRouter)
- P2 Agent emoji/avatar picker for custom agents
- P2 Dark/light theme toggle
- P3 Share-a-chat via public URL (requires backend)
- P3 Real Google Drive refresh-token OAuth flow

## Files touched this session (v2.0)
- `src/types/index.ts` — added UsageEntry, MessageUsage, PinnedMemory, ExternalAsset expanded
- `src/utils/secureStorage.ts` (new)
- `src/utils/commands.ts` (new)
- `src/utils/integrations.ts` (new)
- `src/utils/api.ts` — per-agent resolution, usage logging, friendlier errors
- `src/store/index.ts` — big expansion: secure keys, usage ledger, pinned memories,
  core agent prefs, export/import, deleteMessage, external-asset secrets
- `src/components/MessageBubble.tsx` — tappable + usage tag
- `src/components/MessageActionsMenu.tsx` (new)
- `src/components/ChatMainArea.tsx` — slash commands, @-chaining, action menu,
  continuity banner, cost tag, inline save-error
- `src/screens/ChatHub.tsx` — continueContext plumbing for Continue-in-DM
- `src/screens/SettingsScreen.tsx` — major rewrite: usage section, per-agent
  pinning, integrations, workflow editor, backup/restore, inline errors
- `src/screens/AgentsScreen.tsx` — tap core agents to view pinned memories
- `package.json` — added expo-secure-store, expo-clipboard
