import type {
  CatalogEntry,
  CatalogModel,
  CatalogModelType,
} from './catalog-model';

// Negative on purpose: definitions without catalog data must keep accepting temperature.
export const NO_TEMPERATURE_CAPABILITY = 'no_temperature';

type CapabilityRule = {
  capability: string;
  applies: (entry: CatalogEntry, type: CatalogModelType) => boolean;
};

const CAPABILITY_RULES: CapabilityRule[] = [
  { capability: 'chat', applies: (_, type) => type === 'llm' },
  { capability: 'embedding', applies: (_, type) => type === 'embedding' },
  {
    capability: 'vision',
    applies: (entry, type) =>
      type === 'llm' && entry.inputModalities.includes('image'),
  },
  {
    capability: 'function_calling',
    applies: (entry, type) => type === 'llm' && entry.toolCall,
  },
  {
    capability: 'reasoning',
    applies: (entry, type) => type === 'llm' && entry.reasoning,
  },
  {
    capability: 'structured_output',
    applies: (entry, type) => type === 'llm' && entry.structuredOutput,
  },
  {
    capability: NO_TEMPERATURE_CAPABILITY,
    applies: (entry, type) => type === 'llm' && !entry.temperature,
  },
];

const EMBEDDING_PATTERN = /embed/i;

function classifyType(entry: CatalogEntry): CatalogModelType | null {
  if (EMBEDDING_PATTERN.test(`${entry.id} ${entry.family ?? ''}`)) {
    return 'embedding';
  }
  const textIn = entry.inputModalities.includes('text');
  const textOut = entry.outputModalities.includes('text');
  return textIn && textOut ? 'llm' : null;
}

export function toCatalogModel(
  provider: string,
  entry: CatalogEntry,
): CatalogModel | null {
  const modelType = classifyType(entry);
  if (!modelType) return null;

  return {
    provider,
    providerKey: entry.id,
    displayName: entry.name,
    modelType,
    family: entry.family,
    contextWindow: entry.contextWindow,
    maxOutput: modelType === 'embedding' ? null : entry.maxOutput,
    capabilities: CAPABILITY_RULES.filter((rule) =>
      rule.applies(entry, modelType),
    ).map((rule) => rule.capability),
    pricing: entry.pricing,
    releaseDate: entry.releaseDate,
    status: entry.status,
  };
}
