export type ModelCatalogEntry = {
  value: string;
  label: string;
  provider: string;
};

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  { value: "openai/gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
  { value: "openai/gpt-5.2", label: "GPT-5.2", provider: "OpenAI" },
  { value: "openai/gpt-5.1", label: "GPT-5.1", provider: "OpenAI" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { value: "openai/gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },

  { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { value: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic" },

  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "Google" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "Google" },

  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta" },
  { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "Meta" },

  { value: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", provider: "DeepSeek" },
  { value: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", provider: "DeepSeek" },
  { value: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek" },
  { value: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", provider: "DeepSeek" },

  { value: "x-ai/grok-4", label: "Grok 4", provider: "xAI" },
  { value: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", provider: "xAI" },
  { value: "x-ai/grok-4-fast", label: "Grok 4 Fast", provider: "xAI" },
  { value: "x-ai/grok-3", label: "Grok 3", provider: "xAI" },

  { value: "mistralai/mistral-medium-3.1", label: "Mistral Medium 3.1", provider: "Mistral" },
  { value: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", provider: "Mistral" },
  { value: "mistralai/codestral-2508", label: "Codestral", provider: "Mistral" },
];
