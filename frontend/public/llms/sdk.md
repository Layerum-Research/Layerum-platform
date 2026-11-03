# Layerum SDK Documentation (`@layerum-team/rag-sdk`)

## 1. Overview

`@layerum-team/rag-sdk` is the official TypeScript/JavaScript SDK for Layerum public API (`/v1/*`).

It wraps:
- entity management
- document ingestion/upload
- ingestion status/error/retry
- RAG querying
- model listing

Auth is always API key based (`lyr_wk_*`).

---

## 2. Install

```bash
npm i @layerum-team/rag-sdk
```

npm package:
`https://www.npmjs.com/package/@layerum-team/rag-sdk`

---

## 3. Create Client

```ts
import { LayerumClient } from "@layerum-team/rag-sdk";

const client = new LayerumClient({
  apiKey: process.env.LAYERUM_API_KEY!, // lyr_wk_...
  baseUrl: process.env.LAYERUM_API_URL!,
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

### `LayerumClientOptions`

- `apiKey: string` (required)
- `baseUrl: string` (required) URL of your Layerum API, for example `http://localhost:4000`
- `timeoutMs?: number` default `30000`
- `maxRetries?: number` default `2`
- `workspaceId?: string` deprecated/ignored

Retry behavior:
- Retries only idempotent requests (`GET`)
- Retries only on `429` and `5xx`
- Does not auto-retry `POST/PATCH/DELETE`

---

## 4. Error Handling

SDK throws `LayerumApiError`:

```ts
class LayerumApiError extends Error {
  status: number;
  details?: unknown;
  path?: string;
  method?: string;
}
```

Example:

```ts
import { LayerumApiError } from "@layerum-team/rag-sdk";

try {
  await client.query.run({
    entityId: "...",
    modelConfigId: "...",
    query: "Hello",
  });
} catch (e) {
  if (e instanceof LayerumApiError) {
    console.error(e.status, e.message, e.path, e.method, e.details);
  }
}
```

---

## 5. API Surface

`LayerumClient` has:

- `client.entities`
- `client.entityTypes`
- `client.documents`
- `client.ingestion`
- `client.query`
- `client.models`

---

## 6. `client.entities`

### `list(parentId?: UUID): Promise<Entity[]>`
Returns scoped entities. If `parentId` is provided, SDK filters by parent client-side.

### `tree(): Promise<Entity[]>`
Returns hierarchical tree.

### `create(input: CreateEntityInput): Promise<Entity>`

```ts
await client.entities.create({
  entityTypeId: "<entity_type_uuid>",
  name: "Invoices",
  description: "Accounting docs",
  parentId: "<optional_parent_uuid>",
  metadata: { team: "finance" },
});
```

`CreateEntityInput`:
- `entityTypeId` required
- `name` required
- `description?`
- `parentId?`
- `metadata?`

### `remove(entityId: UUID): Promise<{ success: boolean }>`

---

## 7. `client.entityTypes`

### `list(): Promise<EntityType[]>`
List all entity types available in workspace scope for this API key.

### `get(entityTypeId: UUID): Promise<EntityType>`
Get one entity type by id.

### `create(input: CreateEntityTypeInput): Promise<EntityType>`

```ts
await client.entityTypes.create({
  name: "project",
  label: "Project",
});
```

### `remove(entityTypeId: UUID): Promise<{ success: boolean }>`
Delete one entity type by id.

---

## 8. `client.documents`

### 8.1 Read

### `list(input: ListSourcesInput): Promise<DataSource[]>`

`ListSourcesInput`:
- `entityId` required
- `allInWorkspace?` if `true`, calls `/v1/documents`

### `get(entityId: UUID, sourceId: UUID): Promise<DataSource>`

---

### 8.2 Create Text/URL docs

### `createText(input: CreateTextDocumentInput)`

```ts
await client.documents.createText({
  entityId: "<entity_uuid>",
  displayName: "Readme",
  rawText: "Project notes...",
  visibility: "self_and_descendants",
  modelConfigId: "<optional_model_config_uuid>",
});
```

### `createUrl(input: CreateUrlDocumentInput)`

```ts
await client.documents.createUrl({
  entityId: "<entity_uuid>",
  displayName: "Docs URL",
  sourceUrl: "https://example.com/docs",
});
```

---

### 8.3 Upload document (multipart through backend)

### `upload(input: UploadDocumentInput)`

`UploadDocumentInput`:
- `entityId` required
- `file` required (`Blob | File | Buffer | Uint8Array | ArrayBuffer`)
- `fileName` required
- `contentType?`
- `visibility?`
- `modelConfigId?`

Example:

```ts
await client.documents.upload({
  entityId: "<entity_uuid>",
  file: myBlobOrBuffer,
  fileName: "manual.pdf",
  visibility: "self_and_descendants",
});
```

---

### 8.4 Presigned upload flow

Use this for large files and direct-to-S3 upload.

### `uploadInit(input: UploadInitInput): Promise<UploadInitResponse>`

`UploadInitInput`:
- `entityId` required
- `fileName` required
- `fileSizeBytes` required (**must match actual uploaded file size exactly**)
- `contentType?`
- `visibility?`
- `modelConfigId?`

`UploadInitResponse`:
- `uploadId`
- `objectKey`
- `uploadUrl`
- `method: "POST"`
- `fields: Record<string, string>`
- `expiresInSeconds`

### `uploadComplete(input)`

Input:
- `entityId` required
- `uploadId` required
- `displayName?`
- `visibility?`
- `modelConfigId?`
- `checksum?`

### `uploadDirect(input: UploadDocumentInput)`

Convenience helper that performs:
1. `uploadInit`
2. `POST` multipart to presigned `uploadUrl` with returned `fields`
3. `uploadComplete`

Example:

```ts
await client.documents.uploadDirect({
  entityId: "<entity_uuid>",
  file: fileBlob,
  fileName: "large.pdf",
  contentType: "application/pdf",
});
```

Important:
- SDK sends `fileSizeBytes = blob.size` automatically.
- Backend rejects completion if uploaded size differs from declared size.

---

### 8.5 Delete document

### `remove(input: DeleteDocumentInput)`

`DeleteDocumentInput`:
- `entityId`
- `sourceId`

---

## 9. `client.ingestion`

### `retry(input)`
Retries failed ingestion:

```ts
await client.ingestion.retry({
  entityId: "<entity_uuid>",
  sourceId: "<source_uuid>",
});
```

### `error(input)`
Returns latest ingestion error details.

### `waitUntilReady(input: WaitUntilReadyInput)`
Polls until document status becomes `completed` or `failed`.

Defaults:
- `timeoutMs = 120000`
- `intervalMs = 2000`

Example:

```ts
await client.ingestion.waitUntilReady({
  entityId: "<entity_uuid>",
  sourceId: "<source_uuid>",
  timeoutMs: 180000,
  intervalMs: 2500,
});
```

If ingestion fails, SDK throws error and includes latest ingestion message when possible.

---

## 10. `client.query`

### `run(input: QueryInput): Promise<QueryResponse>`
### `runDebug(input: QueryInput): Promise<QueryResponse>`

`QueryInput`:
- `entityId`
- `modelConfigId`
- `query`
- `topK?`
- `includeParentScopes?`

Example:

```ts
const result = await client.query.run({
  entityId: "<entity_uuid>",
  modelConfigId: "<model_config_uuid>",
  query: "Summarize key points",
  topK: 8,
});

console.log(result.answer);
console.log(result.citations);
```

`runDebug` returns additional `meta` fields when backend provides them.

---

## 11. `client.models`

### `listConfigs(): Promise<ModelConfig[]>`
Lists model configs available to the API key.

### `getConfig(modelConfigId: UUID): Promise<ModelConfig>`
Get one model config by id.

### `createConfig(input: CreateModelConfigInput): Promise<ModelConfig>`
Create model config via public API.

### `updateConfig(modelConfigId: UUID, input: UpdateModelConfigInput): Promise<ModelConfig>`
Update model config via public API.

### `removeConfig(modelConfigId: UUID): Promise<{ success: boolean }>`
Delete model config via public API.

### `listDefinitions(input?: { type?: string }): Promise<ModelDefinition[]>`
Lists model definitions; optional type filter.

Example:

```ts
const embeddingDefs = await client.models.listDefinitions({ type: "embedding" });
```

---

## 12. `client.providers`

### `list(): Promise<ProviderConnection[]>`
List provider connections visible to API key.

### `get(providerId: UUID): Promise<ProviderConnection>`
Get provider connection by id.

### `create(input: CreateProviderInput): Promise<ProviderConnection>`
Create provider connection.

### `test(providerId: UUID): Promise<{ success: boolean }>`
Test provider connection.

### `remove(providerId: UUID): Promise<{ success: boolean }>`
Delete provider connection.

---

## 13. Type Reference (Main)

### `Visibility`
- `"self"`
- `"self_and_descendants"`

### `DataSource.status`
- `"pending"`
- `"processing"`
- `"completed"`
- `"failed"`

### `QueryResponse`
- `answer: string`
- `citations[]` with index, title, excerpt, score
- optional `meta`

### `Entity`
Includes:
- `id`, `name`
- `parentId` / `parent_id`
- `entityTypeId` / `entity_type_id`
- optional `children`

### `EntityType`
Includes:
- `id`
- `name`
- `label`

### `DataSource`
Includes:
- ids
- source type
- display name
- status
- visibility
- mime/file size
- timestamps

---

## 14. End-to-End Example

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
  throw new Error("Missing root entity or model config");
}

const source = await client.documents.uploadDirect({
  entityId: root.id,
  file: new Blob(["Layerum SDK test document"]),
  fileName: "sdk-test.txt",
  contentType: "text/plain",
});

await client.ingestion.waitUntilReady({
  entityId: root.id,
  sourceId: source.id,
});

const answer = await client.query.run({
  entityId: root.id,
  modelConfigId: model.id,
  query: "What does sdk-test.txt contain?",
});

console.log(answer.answer);
```

---

## 15. Operational Notes

- SDK targets the `/v1` public API only.
- API key scope restrictions apply to all SDK operations.
- Capacity limits are enforced server-side for uploads and ingestion.
- For best reliability on big files, prefer `uploadDirect` (presigned flow) over raw multipart proxy uploads.
