export type OpenAiConfig = {
  key: string;
  baseUrl: string;
  model: string;
};

const defaultApiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? '';
const defaultBaseUrl = (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined)?.trim() ?? 'https://api.openai.com/v1';
const defaultModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim() ?? 'gpt-4o-mini';

export const openAiConfig: OpenAiConfig = {
  key: defaultApiKey,
  baseUrl: defaultBaseUrl || 'https://api.openai.com/v1',
  model: defaultModel || 'gpt-4o-mini'
};

export function normalizedChatUrl() {
  return openAiConfig.baseUrl.replace(/\/$/, '') + '/chat/completions';
}
