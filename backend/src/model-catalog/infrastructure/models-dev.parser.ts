import type {
  CatalogEntry,
  CatalogModel,
  CatalogModelStatus,
  CatalogPricing,
} from '../domain/catalog-model';
import {
  CATALOG_PROVIDER_KEYS,
  CATALOG_PROVIDERS,
} from '../domain/catalog-providers';
import { toCatalogModel } from '../domain/model-classifier';

type JsonRecord = Record<string, unknown>;

const STATUSES: readonly CatalogModelStatus[] = ['beta', 'deprecated'];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveInt(value: unknown) {
  const parsed = readNumber(value);
  return parsed !== null && parsed > 0 ? Math.trunc(parsed) : null;
}

function readStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readDate(value: unknown) {
  const raw = readString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return null;
}

function readStatus(value: unknown): CatalogModelStatus | null {
  return STATUSES.find((status) => status === value) ?? null;
}

function readPricing(value: unknown): CatalogPricing | null {
  if (!isRecord(value)) return null;
  return {
    input: readNumber(value.input),
    output: readNumber(value.output),
    cacheRead: readNumber(value.cache_read),
  };
}

function readEntry(value: unknown): CatalogEntry | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  if (!id) return null;
  const modalities = isRecord(value.modalities) ? value.modalities : {};
  const limit = isRecord(value.limit) ? value.limit : {};

  return {
    id,
    name: readString(value.name) ?? id,
    family: readString(value.family),
    inputModalities: readStrings(modalities.input),
    outputModalities: readStrings(modalities.output),
    toolCall: value.tool_call === true,
    reasoning: value.reasoning === true,
    structuredOutput: value.structured_output === true,
    temperature: value.temperature !== false,
    contextWindow: readPositiveInt(limit.context),
    maxOutput: readPositiveInt(limit.output),
    pricing: readPricing(value.cost),
    releaseDate: readDate(value.release_date),
    status: readStatus(value.status),
  };
}

function readProviderModels(catalog: JsonRecord, catalogKey: string) {
  const provider = catalog[catalogKey];
  if (!isRecord(provider) || !isRecord(provider.models)) return [];
  return Object.values(provider.models);
}

export function parseModelsDevCatalog(payload: unknown): CatalogModel[] {
  if (!isRecord(payload)) {
    throw new Error('models.dev catalog has unexpected shape');
  }

  return CATALOG_PROVIDERS.flatMap((provider) =>
    readProviderModels(payload, CATALOG_PROVIDER_KEYS[provider])
      .map(readEntry)
      .filter((entry): entry is CatalogEntry => entry !== null)
      .map((entry) => toCatalogModel(provider, entry))
      .filter((model): model is CatalogModel => model !== null),
  );
}
