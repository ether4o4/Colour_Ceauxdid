import { RED_TOOL_BRIDGE } from '../config/redToolBridge';

export type RedToolCommand =
  | { kind: 'shell'; command: string }
  | { kind: 'scrape'; url: string }
  | { kind: 'tts'; text: string; play?: boolean; outputPath?: string; voiceId?: string; modelId?: string; outputFormat?: string };

export interface RedToolResult {
  ok: boolean;
  output: string;
  exitCode?: number;
}

function truncateOutput(text: string): string {
  if (text.length <= RED_TOOL_BRIDGE.maxOutputChars) return text;
  const half = Math.floor((RED_TOOL_BRIDGE.maxOutputChars - 120) / 2);
  return `${text.slice(0, half)}\n\n... [tool output truncated] ...\n\n${text.slice(-half)}`;
}

export async function callRedToolBridge(command: RedToolCommand): Promise<RedToolResult> {
  if (!RED_TOOL_BRIDGE.enabled) {
    return { ok: false, output: 'Red local tool bridge is disabled in src/config/redToolBridge.ts.' };
  }

  const endpoint =
    command.kind === 'shell' ? '/shell'
    : command.kind === 'scrape' ? '/scrape'
    : '/tts';
  const body =
    command.kind === 'shell' ? { command: command.command }
    : command.kind === 'scrape' ? { url: command.url }
    : {
        text: command.text,
        play: command.play,
        outputPath: command.outputPath,
        voiceId: command.voiceId,
        modelId: command.modelId,
        outputFormat: command.outputFormat,
      };

  try {
    const resp = await fetch(`${RED_TOOL_BRIDGE.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Red-Tool-Token': RED_TOOL_BRIDGE.token,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({} as any));
    const output = data.output || data.error || `Bridge returned ${resp.status}`;
    return {
      ok: resp.ok && data.ok !== false,
      output: truncateOutput(String(output)),
      exitCode: typeof data.exitCode === 'number' ? data.exitCode : undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      output: `Could not reach Red local tool bridge at ${RED_TOOL_BRIDGE.baseUrl}. Start it with:\nRED_TOOL_TOKEN=${RED_TOOL_BRIDGE.token} node local-tool-bridge/server.mjs`,
    };
  }
}

export async function speakWithElevenLabs(
  text: string,
  options: Omit<Extract<RedToolCommand, { kind: 'tts' }>, 'kind' | 'text'> = {},
): Promise<RedToolResult> {
  return callRedToolBridge({ kind: 'tts', text, play: true, ...options });
}
