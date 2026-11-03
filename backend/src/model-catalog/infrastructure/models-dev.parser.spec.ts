import { parseModelsDevCatalog } from './models-dev.parser';

const catalog = {
  anthropic: {
    models: {
      'claude-opus-5-5': {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        family: 'claude-opus',
        tool_call: true,
        reasoning: true,
        structured_output: true,
        temperature: false,
        modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
        limit: { context: 1000000, output: 128000 },
        cost: { input: 5, output: 25, cache_read: 0.5 },
        release_date: '2026-09-22',
      },
    },
  },
  openai: {
    models: {
      'text-embedding-3-large': {
        id: 'text-embedding-3-large',
        name: 'text-embedding-3-large',
        family: 'text-embedding',
        modalities: { input: ['text'], output: ['text'] },
        limit: { context: 8191, output: 3072 },
        cost: { input: 0.13, output: 0 },
        release_date: '2024-01',
        status: 'deprecated',
      },
      'gpt-image-2': {
        id: 'gpt-image-2',
        name: 'GPT Image 2',
        modalities: { input: ['text'], output: ['image'] },
      },
    },
  },
  'moonshotai-cn': {
    models: {
      'kimi-k3': {
        id: 'kimi-k3',
        modalities: { input: ['text'], output: ['text'] },
        status: 'unknown',
      },
    },
  },
  unsupported: {
    models: {
      other: { id: 'other', modalities: { input: ['text'], output: ['text'] } },
    },
  },
};

describe('parseModelsDevCatalog', () => {
  const models = parseModelsDevCatalog(catalog);

  it('maps catalog providers to ours and skips unsupported ones', () => {
    expect(models.map((model) => [model.provider, model.providerKey])).toEqual([
      ['openai', 'text-embedding-3-large'],
      ['anthropic', 'claude-opus-5-5'],
      ['kimi', 'kimi-k3'],
    ]);
  });

  it('builds llm definitions with capabilities, limits and pricing', () => {
    expect(models.find((model) => model.provider === 'anthropic')).toEqual({
      provider: 'anthropic',
      providerKey: 'claude-opus-5-5',
      displayName: 'Claude Opus 5.5',
      modelType: 'llm',
      family: 'claude-opus',
      contextWindow: 1000000,
      maxOutput: 128000,
      capabilities: [
        'chat',
        'vision',
        'function_calling',
        'reasoning',
        'structured_output',
        'no_temperature',
      ],
      pricing: { input: 5, output: 25, cacheRead: 0.5 },
      releaseDate: '2026-09-22',
      status: null,
    });
  });

  it('marks only models that explicitly reject temperature', () => {
    const [accepting, unknown] = parseModelsDevCatalog({
      openai: {
        models: {
          'gpt-4o': {
            id: 'gpt-4o',
            temperature: true,
            modalities: { input: ['text'], output: ['text'] },
          },
          'gpt-next': {
            id: 'gpt-next',
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    });

    expect(accepting.capabilities).toEqual(['chat']);
    expect(unknown.capabilities).toEqual(['chat']);
  });

  it('classifies embeddings and normalizes month-only dates', () => {
    expect(models.find((model) => model.provider === 'openai')).toMatchObject({
      modelType: 'embedding',
      maxOutput: null,
      capabilities: ['embedding'],
      releaseDate: '2024-01-01',
      status: 'deprecated',
    });
  });

  it('falls back to the id when name is missing', () => {
    expect(models.find((model) => model.provider === 'kimi')).toMatchObject({
      displayName: 'kimi-k3',
      status: null,
      pricing: null,
    });
  });

  it('rejects a non-object payload', () => {
    expect(() => parseModelsDevCatalog([])).toThrow();
  });
});
