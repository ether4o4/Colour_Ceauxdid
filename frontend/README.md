# Colour Ceauxdid

A mobile-first multi-agent AI orchestration platform with integrated real-time group chat.

## What it is

Five AI agents — each with a unique identity, behavior, memory, and specialty — collaborating in a shared group chat. Not a chatbot. A coordinated intelligence system.

## Agents

| Agent | Role | Personality |
|-------|------|-------------|
| 🔴 Red | Command & Decision | Decisive, minimal, authoritative |
| 🔵 Blue | Logic & Analysis | Structured, logical, precise |
| 🟢 Green | Building & Execution | Efficient, output-focused |
| 🟡 Yellow | Creative & Expansion | Visionary, exploratory |
| 🟣 Purple | Memory & Oversight | Quiet, corrective |

Up to 5 additional custom agents supported.

## Features

- Multi-agent group chat with @mentions (`@Red`, `@Blue`, `@swarm`)
- Smart message routing — agents respond based on content
- Streaming responses per agent
- Per-agent memory (AsyncStorage)
- Task tracker with agent assignment
- Custom agent creator
- Workflow saving
- Silent mode / focused mode
- Dark terminal aesthetic

## Stack

- React Native + Expo
- OpenRouter (free models — Llama 3.1 8B)
- AsyncStorage for persistence
- React Navigation (bottom tabs + stack)
- EAS Build for APK

## Setup

```bash
npm install
npx expo start
```

## Build APK

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

## API Key

Add your OpenRouter key in `src/utils/api.ts`:
```ts
const OPENROUTER_API_KEY = 'your-key-here';
```

Or use an `.env` file with `EXPO_PUBLIC_OPENROUTER_API_KEY`.
