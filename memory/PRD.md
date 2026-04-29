# Colour Ceauxdid — PRD & Change Log

## Original problem statement
> The addiction of api keys or local models either one are not functional as well as
> a few other things, like when saving a configuration it doesn't seem persistent.
> The save doesn't actually work. Analyze the full app for 100% functionality of
> entire scope.
>
> Additional scope (clarification from user):
> - 1-on-1 chats with each "colour" must be persistent and independent (Red, Blue,
>   Green, Yellow, Purple — can all be open simultaneously but separately).
> - Group chat must be separate from individual chat, with memory flowing FROM
>   group chat INTO individual chat, but NOT the other way.
> - Multiple API keys per provider for simultaneous multi-agent use.

## App summary
Colour Ceauxdid is a React Native / Expo multi-agent AI chat app. 5 built-in
color-coded agents (Red = command, Blue = logic, Green = execution, Yellow =
creative, Purple = memory) plus up to 5 custom agents. BYOK via OpenRouter or
Ollama. All data persisted locally via AsyncStorage (localStorage on web).
Runs on port 3000 via Expo Web in the preview environment.

## Tech stack
- React Native 0.81 + Expo 54 (web + native)
- React Navigation (bottom tabs + stack)
- AsyncStorage for all persistence — no backend
- OpenRouter (hosted multi-provider) + Ollama (local) via `fetch` streaming

## User personas
- Power-user tinkering with multiple AI agents for research / planning / coding
- Adds own OpenRouter key or points at a local Ollama instance
- Wants isolated per-agent conversations AND group "swarm" chats

## What was implemented in this session (2026-01)
- **Scope-aware message storage** (`src/store/index.ts`): messages now live in
  `cc_msgs_agent_<id>` or `cc_msgs_project_<id>` buckets. Added `ChatScope`
  type, `getMessages(scope)`, `saveMessage(msg, scope)`, `updateMessage`,
  `clearScope`, `clearAllMessages`, `getGroupMessagesForAgent(agentId)`.
- **One-time migration** of the legacy single `cc_messages` bucket to
  `cc_msgs_project_legacy` so old conversations aren't dropped.
- **API Keys CRUD** in store: `getApiKeys/saveApiKey/deleteApiKey/markApiKeyUsed`
  with multi-key support per provider, label, isActive flag.
- **Provider settings**: `getProviderSettings/updateProviderSettings` holding
  `defaultProvider` (openrouter|ollama), `defaultModel`, `ollamaModel`.
- **Multi-provider LLM dispatch** (`src/utils/api.ts`): removed hardcoded
  OpenRouter key, added round-robin `pickKey()`, `streamAgentResponse` routes
  to either OpenRouter (`/chat/completions` streaming) or Ollama (`/api/chat`
  streaming). Added `testOpenRouterKey` (via `/auth/key` — auth-required) and
  `testOllamaEndpoint` (via `/api/tags`).
- **Chat scope + memory rule** (`src/components/ChatMainArea.tsx`):
  `buildContextForAgent` merges private history + group-chat history from
  projects the agent participates in — only for LLM context, never into the
  rendered message list. Group-scope reads only that project's messages.
- **API Keys UI** (`src/screens/SettingsScreen.tsx`): new section with provider
  toggle, model picker, add-key modal with live validation, multi-key list with
  per-key isActive switch and delete.
- **New chat UX**: in-bubble error rendering when LLM call fails, per-chat
  "Clear this chat" menu, scope tag badges (1-on-1 / GROUP / ARCHIVED) in
  header, better empty states with memory-rule explainer.
- **Project creation race fix**: sidebar's `handleCreateProject` now calls
  `onDataChanged?.()` before `onSelectProject()`; ChatHub's `handleSelectProject`
  auto-reloads when given an unknown project id.
- **Security**: removed leaked OpenRouter key from `src/utils/api.ts`. No more
  hardcoded secrets in source.

## What was deleted / cleaned up
- `/app/backend/providers.py` (unused — no backend for this app)
- Legacy single-bucket message reads from `cc_messages` (migrated, not dropped)

## Verified by automated testing (3 iterations)
- Chat isolation: Red/Blue/Green/Yellow/Purple 1-on-1s all independent
- Persistence: messages survive page reload, stay in their own scope
- Group vs 1-on-1 separation: group messages don't appear in 1-on-1 views
- Invalid OpenRouter key correctly rejected (iteration 2 fix)
- Invalid Ollama endpoint correctly rejected
- Group project creation → chat view renders → send works → no leakage (iteration 3 fix)
- No hardcoded API keys anywhere in source tree

## Prioritized backlog / nice-to-haves (not done, not blocking)
- P2 Replace `Alert.alert` with inline `<Text>` error inside API-key modals
  (cleaner UX on web, easier test automation)
- P2 Per-agent "preferred key" assignment (currently round-robin across all
  active keys of the chosen provider)
- P2 Workflow steps UI (save-workflow currently saves an empty `steps: []`
  because there's no step editor yet)
- P2 Real GitHub / Drive asset connection OAuth (UI mockup only today)
- P2 Export / import per-chat archives

## Known minor issues (non-blocking)
- React Native web throws a `props.pointerEvents` deprecation warning
  (harmless, from library internals)
- Some Expo peer versions are slightly newer than Expo 54 expects
  (gesture-handler 2.31 vs 2.28). App works; upgrade later.

## Security action required BY USER
- Revoke both OpenRouter keys that were exposed:
  - `sk-or-v1-0497a19ada...1386` (in public GitHub history)
  - `sk-or-v1-a58c8342de...5824` (shared in chat)
  Replace with fresh keys added via the Settings → API Keys UI.

## Files touched
- `/app/frontend/package.json` — start script → `expo start --web --port 3000`; added `react-native-worklets`
- `/app/frontend/src/store/index.ts` — scope-aware persistence + API keys + provider settings
- `/app/frontend/src/utils/api.ts` — multi-provider dispatch, BYOK, validators
- `/app/frontend/src/components/ChatMainArea.tsx` — scope-aware, memory inheritance, error bubbles
- `/app/frontend/src/screens/SettingsScreen.tsx` — API Keys & Providers UI
- `/app/frontend/src/screens/ChatHub.tsx` — safe project selection
- `/app/frontend/src/components/SidebarNavigation.tsx` — onDataChanged prop, testIDs

## Test reports
- `/app/test_reports/iteration_1.json` — initial full sweep (12/13 pass)
- `/app/test_reports/iteration_2.json` — retest after first fix (3 pass, 1 partial)
- `/app/test_reports/iteration_3.json` — final retest (100% pass)
