# Red Local Tool Bridge

This is a personal local bridge for the Red agent. It gives the app explicit `/shell`
and `/scrape` commands without shipping raw shell access as a normal public feature.

## Start on Windows PowerShell

```powershell
cd C:\Users\redma\OneDrive\Desktop\Colour_Ceauxdid-apk-build-2\Colour_Ceauxdid-apk-build-2\frontend
$env:RED_TOOL_TOKEN = "change-me-red-tool-token"
$env:RED_TOOL_ROOT = "C:\Users\redma\OneDrive\Desktop"
node .\local-tool-bridge\server.mjs
```

## Start on Termux

```sh
cd /path/to/frontend
export RED_TOOL_TOKEN=change-me-red-tool-token
export RED_TOOL_ROOT=$HOME
node local-tool-bridge/server.mjs
```

To let the Expo app call this bridge, build/run the app with matching public
bridge config:

```sh
export EXPO_PUBLIC_RED_TOOL_ENABLED=true
export EXPO_PUBLIC_RED_TOOL_BASE_URL=http://127.0.0.1:8787
export EXPO_PUBLIC_RED_TOOL_TOKEN="$RED_TOOL_TOKEN"
```

Use a private random token instead of the example placeholder if the bridge is
reachable from anything besides your own phone.

## ElevenLabs TTS on Termux

Put your key in `.env`:

```sh
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

Install the optional Termux playback helper:

```sh
pkg install termux-api
```

Test, save, and play an MP3 with Node:

```sh
npm run tts:test -- "Colour Ceauxdid voice is online."
```

Or test the Python SDK path:

```sh
python -m pip install elevenlabs
npm run tts:python -- "Colour Ceauxdid online"
```

The reusable Node function is `synthesizeElevenLabsTts()` in
`local-tool-bridge/elevenlabs-tts.mjs`. The reusable Python function is
`elevenlabs_tts()` in `scripts/elevenlabs_tts.py`. The app-side client helper is
`speakWithElevenLabs()` in `src/utils/redToolBridge.ts`; it calls the bridge
`/tts` route so the ElevenLabs key stays in Termux instead of the bundled app.

## Use in chat

```text
/shell pwd
/shell rg "api key" .
/scrape https://example.com
```

## Permission knobs

- `RED_TOOL_ROOT`: highest folder shell commands can run inside.
- `RED_TOOL_ALLOWED_PREFIXES`: comma-separated command prefixes for allowlist mode.
- `RED_TOOL_MODE=full`: disables the prefix/control-operator guard. Use only for a private local bridge.
- `RED_TOOL_TIMEOUT_MS`: command timeout, default `30000`.
- `RED_TOOL_MAX_OUTPUT`: output cap, default `12000`.
- `RED_TOOL_ALLOWED_ORIGINS`: browser origins allowed by CORS, default localhost port 3000.

The app-side URL and token live in `src/config/redToolBridge.ts`.
