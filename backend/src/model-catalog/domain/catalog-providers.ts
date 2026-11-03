export const CATALOG_PROVIDER_KEYS = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  mistral: 'mistral',
  cohere: 'cohere',
  groq: 'groq',
  together: 'togetherai',
  azure_openai: 'azure',
  qwen: 'alibaba',
  kimi: 'moonshotai-cn',
  deepseek: 'deepseek',
} as const satisfies Record<string, string>;

export type CatalogProvider = keyof typeof CATALOG_PROVIDER_KEYS;

export const CATALOG_PROVIDERS = Object.keys(
  CATALOG_PROVIDER_KEYS,
) as CatalogProvider[];
