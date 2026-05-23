# Colour Ceauxdid

Mobile-first multi-agent AI chat. Five color-coded agents (Red, Blue, Green, Yellow, Purple) plus your own custom agents, each with a distinct personality and voice, in a shared group chat. OpenRouter or local Ollama for inference, ElevenLabs for spoken replies.

## 📲 Download the app

**[⬇️ Download latest APK](https://github.com/ether4o4/Colour_Ceauxdid/releases/latest/download/colour-ceauxdid.apk)**

Tap that link on your Android phone, then open the downloaded file to install (allow "install from this source" if prompted). It always points to the newest build — no need to hunt through releases.

> Every push to `main` auto-builds a fresh standalone APK and updates this link.

## First-time setup

1. **Chat model** — Settings → API Keys → add an [OpenRouter](https://openrouter.ai/keys) key (`sk-or-v1-…`), or point at a local Ollama server.
2. **Voices (optional)** — Settings → Voice → add a free [ElevenLabs](https://elevenlabs.io) key (`sk_…`). Each agent gets its own voice. Add multiple keys to extend the free monthly quota — they rotate automatically. Toggle **Auto-speak** to hear every reply, or tap a message → Speak.

## Notes

- Free OpenRouter models share a rate-limited pool; if one is busy the app auto-falls-back through a chain of free models. For no limits, add $1 of OpenRouter credits and pick a paid model.
- All keys are stored in the device keychain (`expo-secure-store`), never in the repo.
