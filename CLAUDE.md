# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

Colour Ceauxdid (v2.0) is a multi-agent AI orchestration platform. The product is a **React Native + Expo** mobile/web app under `frontend/`; the `backend/` is a minimal **FastAPI + MongoDB** service used only for status logging in this scaffold. Real product logic — agents, chat, secure key storage, slash commands, @-mention chaining, cost ledger, workflow editor, integrations — lives entirely in the frontend.

This repo runs on the Emergent platform (see `.emergent/` and `test_result.md`).

## Repository Layout

```
backend/             FastAPI status server (demo only)
  server.py          /api/, /api/status (GET/POST) → MongoDB via Motor
  requirements.txt   Heavy dep list (FastAPI, Motor, Anthropic, OpenAI, LiteLLM, ...)
frontend/            React Native + Expo 54 app (TypeScript strict mode)
  src/
    agents/          DEFAULT_AGENTS (Red/Blue/Green/Yellow/Purple) and templates
    components/      ChatMainArea, SidebarNavigation, MessageBubble,
                     MessageActionsMenu (Continue-in-DM/Pin/Copy/Delete), AgentStrip
    navigation/      React Navigation (bottom tabs + native stack)
    screens/         ChatHub, TasksScreen, AgentsScreen, SettingsScreen
    store/           AsyncStorage wrapper, all keys prefixed `cc_`
    types/           SwarmAgent, SwarmMessage, Project, SavedChat, UsageEntry,
                     PinnedMemory, ExternalAsset, ApiConfig
    utils/
      api.ts         OpenRouter / Ollama client, streaming, usage logging
      commands.ts    Slash-command parsing (/plan /code /brainstorm /factcheck
                     /remember /ask /swarm) and @-mention extraction
      integrations.ts GitHub & Google Drive PAT validation/storage
      secureStorage.ts expo-secure-store on native, xor+base64 on web (obfuscation)
      theme.ts       Colors (dark terminal) and fonts
  app.json           Expo manifest (com.ceauxdid.colour)
  eas.json           EAS Build profiles (development / preview / production)
  package.json       Dev port 3000 for web
  README.md          Frontend setup
  CHAT_HUB_CHANGES.md ChatHub redesign notes
memory/PRD.md        Product requirements + v1→v2 changelog
tests/               Empty placeholder (__init__.py)
test_reports/        Iteration JSON results from the testing agent (1..5)
test_result.md       Testing-agent communication protocol — DO NOT EDIT the
                     "Testing Protocol" header block
.emergent/           Emergent platform metadata (image name, job id)
.gitconfig           Sets author "emergent-agent-e1" for this workspace
```

## Commands

### Frontend (run from `frontend/`)

```bash
npm install
npm run web          # expo start --web --port 3000  (primary dev surface)
npm run dev          # expo start (interactive: a/i/w)
npm run android      # expo start --android
npm run ios          # expo start --ios
npm run build        # expo export --platform web
```

Type-check (no script): `cd frontend && npx tsc --noEmit`. There is no lint or test script for the frontend.

### Backend (run from `backend/`)

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
# GET  http://localhost:8000/api/
# POST http://localhost:8000/api/status   {"client_name": "..."}
```

Required environment variables (loaded from `backend/.env`):

```
MONGO_URL=...
DB_NAME=...
CORS_ORIGINS=*       # comma-separated, defaults to *
```

### Android APK

```bash
cd frontend && npm install -g eas-cli && eas login
eas build --platform android --profile preview
```

## Architecture & Conventions

### Frontend

- **State**: local React state + AsyncStorage. No Redux/Context. All storage keys live in `src/store/index.ts` and are prefixed `cc_` (examples: `cc_projects`, `cc_chats`, `cc_sec_apikey:<id>`, `cc_usage_ledger`, `cc_pinned_memories`, `cc_workflows`, `cc_provider_settings`).
- **Per-thread message keys**: messages are namespaced by scope (project / agent / saved chat) and capped at 500 entries per thread, trimmed on insert. Preserve this when adding new chat surfaces.
- **Secure storage**: API keys go through `src/utils/secureStorage.ts` — `expo-secure-store` on native, xor+base64 obfuscation on web. The web path is **not** cryptographically secure; document any change accordingly.
- **Slash commands**: defined and parsed in `src/utils/commands.ts`. Add new commands there; the chat input picks them up automatically.
- **@-mention chaining**: messages can mention other agents (e.g. `@Red ask @Blue ...`). Chain depth is capped (default 3) to avoid runaway loops — keep that limit when modifying routing.
- **Inline error rendering**: surface errors in the chat stream rather than `Alert.alert`. Existing screens follow this pattern.
- **Theme tokens**: import from `src/utils/theme.ts`. No inline hex values in components. Built-in agents use Red/Blue/Green/Yellow/Purple; custom-agent templates use Cyan/Orange/Pink/Lime/Magenta.
- **Path style**: relative imports, no aliases. TypeScript strict mode is on.
- **Provider abstraction**: `src/utils/api.ts` supports OpenRouter and Ollama with per-agent model pinning and a usage ledger. New providers go in this file plus `ApiConfig` in `src/types/index.ts`.

### Backend

The FastAPI server is intentionally minimal. Routes hang off an `APIRouter(prefix="/api")` and are registered via `app.include_router(api_router)`. CORS is permissive by default. There is **no auth, no business logic** — do not treat the backend as the system of record. If a feature seems to need backend storage, propose it explicitly before adding endpoints.

### Optional frontend env vars

```
EXPO_PUBLIC_OPENROUTER_API_KEY    # fallback key when none is set in Settings
EXPO_PUBLIC_OPENROUTER_BASE_URL   # custom base URL
```

In-app Settings always override env defaults; nothing is hard-coded.

## Testing Protocol

`test_result.md` is the contract between the main agent and the testing agent. The header block (between the `START` and `END - Testing Protocol` markers) **must not be edited or removed**. When you change something testable:

1. Update the relevant task's `status_history` in `test_result.md`.
2. Set `needs_retesting: true` and refresh `test_plan.current_focus`.
3. Append an entry to `agent_communication` describing what changed.
4. Then invoke the testing agent.

Past iteration outputs live as JSON under `test_reports/iteration_*.json`. Iteration 1 flagged a real bug worth knowing about: OpenRouter key validation in `frontend/src/utils/api.ts` historically used the public `/api/v1/models` endpoint, which accepts any string. Use an auth-required endpoint (`/api/v1/auth/key` or `/api/v1/credits`) when validating keys.

## Working in this repo

- Frontend is the system of record; backend is a placeholder. Don't move app state to MongoDB without explicit direction.
- Do not commit `.env` files, API keys, or anything matching `cc_sec_apikey:*` exports. `.gitignore` covers the standard cases — keep it that way.
- Slash commands, agent templates, and integration helpers each have a single home (`utils/commands.ts`, `agents/templates.ts`, `utils/integrations.ts`). Extend in place rather than scattering logic.
- Workflow editor exists; runtime execution does not. If asked to "run a workflow", confirm scope first.
- Web secure storage is obfuscation, not encryption. Surface this in code review if anyone proposes treating it as secure.
