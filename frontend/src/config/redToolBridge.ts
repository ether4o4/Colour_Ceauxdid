function publicEnv(key: string): string {
  return ((globalThis as any).process?.env?.[key] || '').trim();
}

const token = publicEnv('EXPO_PUBLIC_RED_TOOL_TOKEN');

export const RED_TOOL_BRIDGE = {
  enabled: publicEnv('EXPO_PUBLIC_RED_TOOL_ENABLED') === 'true' && token.length > 0,
  baseUrl: publicEnv('EXPO_PUBLIC_RED_TOOL_BASE_URL') || 'http://127.0.0.1:8787',
  token,
  maxOutputChars: 12000,
};
