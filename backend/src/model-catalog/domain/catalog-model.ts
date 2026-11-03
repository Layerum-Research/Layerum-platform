export type CatalogModelType = 'llm' | 'embedding';

export type CatalogModelStatus = 'beta' | 'deprecated';

export type CatalogPricing = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
};

export type CatalogEntry = {
  id: string;
  name: string;
  family: string | null;
  inputModalities: string[];
  outputModalities: string[];
  toolCall: boolean;
  reasoning: boolean;
  structuredOutput: boolean;
  temperature: boolean;
  contextWindow: number | null;
  maxOutput: number | null;
  pricing: CatalogPricing | null;
  releaseDate: string | null;
  status: CatalogModelStatus | null;
};

export type CatalogModel = {
  provider: string;
  providerKey: string;
  displayName: string;
  modelType: CatalogModelType;
  family: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  capabilities: string[];
  pricing: CatalogPricing | null;
  releaseDate: string | null;
  status: CatalogModelStatus | null;
};
