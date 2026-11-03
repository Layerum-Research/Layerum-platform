# `@layerum-team/rag-sdk`

Official Layerum SDK for external RAG workflows.

The SDK uses the same public contract as direct API integrations:
- Auth: `Authorization: Bearer lyr_wk_*`
- Endpoints: `/v1/*`

## Install

```bash
npm i @layerum-team/rag-sdk
```

## Quickstart

```ts
import { LayerumClient } from "@layerum-team/rag-sdk";

const client = new LayerumClient({
  apiKey: process.env.LAYERUM_API_KEY!,
  baseUrl: process.env.LAYERUM_API_URL!,
});

const models = await client.models.listConfigs();
const tree = await client.entities.tree();

const root = tree[0];
const model = models[0];

if (!root || !model) {
  throw new Error("Missing entity or model config");
}

const source = await client.documents.createText({
  entityId: root.id,
  displayName: "Quickstart note",
  rawText: "Layerum SDK quickstart document",
  modelConfigId: model.id,
});

await client.ingestion.waitUntilReady({
  entityId: root.id,
  sourceId: source.id,
});

const result = await client.query.run({
  entityId: root.id,
  modelConfigId: model.id,
  query: "What is this document about?",
});

console.log(result.answer);
```

## API

### `new LayerumClient(options)`

- `apiKey: string` (required, `lyr_wk_*`)
- `baseUrl: string` (required, URL of your Layerum API, for example `http://localhost:4000`)
- `timeoutMs?: number` (default: `30000`)
- `maxRetries?: number` (default: `2`)
- `workspaceId?: string` (deprecated, ignored)

### `client.entities`

- `list(parentId?)`
- `tree()`
- `create({ entityTypeId, name, description?, parentId?, metadata? })`
- `remove(entityId)`

### `client.entityTypes`

- `list()`
- `get(entityTypeId)`
- `create({ name, label })`
- `remove(entityTypeId)`

### `client.documents`

- `list({ entityId, allInWorkspace? })`
- `get(entityId, sourceId)`
- `upload({ entityId, file, fileName, visibility?, modelConfigId? })`
- `uploadDirect({ entityId, file, fileName, contentType?, visibility?, modelConfigId? })`
- `uploadInit({ entityId, fileName, fileSizeBytes, contentType?, visibility?, modelConfigId? })`
- `uploadComplete({ entityId, uploadId, displayName?, visibility?, modelConfigId?, checksum? })`
- `createText({ entityId, displayName, rawText, visibility?, modelConfigId? })`
- `createUrl({ entityId, displayName, sourceUrl, visibility?, modelConfigId? })`
- `remove({ entityId, sourceId })`

### `client.ingestion`

- `retry({ entityId, sourceId })`
- `error({ entityId, sourceId })`
- `waitUntilReady({ entityId, sourceId, timeoutMs?, intervalMs? })`

### `client.query`

- `run({ entityId, modelConfigId, query, topK?, includeParentScopes? })`
- `runDebug({ entityId, modelConfigId, query, topK?, includeParentScopes? })`

### `client.providers`

- `list()`
- `get(providerId)`
- `create({ provider, displayName, apiKey, entityId?, providerConfig? })`
- `test(providerId)`
- `remove(providerId)`

### `client.models`

- `listConfigs()`
- `getConfig(modelConfigId)`
- `createConfig(input)`
- `updateConfig(modelConfigId, input)`
- `removeConfig(modelConfigId)`
- `listDefinitions({ type? })`

## Errors

All API errors throw `LayerumApiError` with:

- `status`
- `message`
- `details`
- `path`
- `method`
