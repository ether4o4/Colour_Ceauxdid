import { resolve } from 'node:path';
import { loadDotEnv, synthesizeElevenLabsTts } from './elevenlabs-tts.mjs';

loadDotEnv(resolve(process.cwd(), '.env'));

const text = process.argv.slice(2).join(' ').trim()
  || 'Colour Ceauxdid ElevenLabs text to speech is wired and ready.';

try {
  const result = await synthesizeElevenLabsTts({
    text,
    outputPath: process.env.ELEVENLABS_TEST_OUTPUT || undefined,
    play: process.env.ELEVENLABS_TEST_PLAY !== 'false',
  });
  console.log(`Saved MP3: ${result.filePath}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`Playback: ${result.playback.attempted ? (result.playback.ok ? 'started' : 'not started') : 'skipped'}`);
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
