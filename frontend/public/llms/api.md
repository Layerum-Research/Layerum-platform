# Layerum Public API Documentation

## 1. Overview

This document describes the **public Layerum API** for external integrations.

Base URL:
- the backend URL of your Layerum installation, for example `http://localhost:4000`

Public API surface:
- All endpoints are under `/v1/*`
- Auth is workspace API key (`lyr_wk_*`)
- Capability and scope checks are enforced server-side

---

## 2. Authentication

Use workspace API key in bearer header:

```http
Authorization: Bearer lyr_wk_xxxxxxxxx
```

Rules:
- API key must start with `lyr_wk_`
- Key must be active, not revoked, not expired
- Capability checks are applied (`query:read`, `data:ingest`, `config:manage`)
- Entity/model scopes are enforced
- Rate/token limits may be enforced per key (`rpm_limit`, `daily_token_limit`)

API keys are created and managed in Layerum platform UI (`Workspace -> API Keys`).

---

## 3. Error Format

Typical error response:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2026-03-24T12:00:00.000Z",
  "path": "/v1/query",
  "method": "POST",
  "details": {}
}
```

Notes:
- `message` can be string, object, or array (validation errors)
- `details` may include provider/backend-specific fields

---

## 4. Shared Enums and Types

### 4.1 Visibility
- `self`
- `self_and_descendants`

### 4.2 Data source type
- `file`
- `url`
- `text`
- `api`

### 4.3 Data source status
- `pending`
- `processing`
- `completed`
- `failed`

### 4.4 API key capability
- `query:read`
- `data:ingest`
- `config:manage`

---

## 5. Public Endpoints (`/v1`)

## 5.1 Entities

- `GET /v1/entities`
- `GET /v1/entities/tree`
- `POST /v1/entities`
- `DELETE /v1/entities/:id`

`POST /v1/entities` body:
- `entity_type_id` (UUID, required)
- `name` (string, required, max 200)
- `description` (string, optional)
- `parent_id` (UUID, optional)
- `metadata` (object, optional)

Notes:
- Scoped keys may be blocked from root entity creation if scope does not allow it

## 5.2 Entity Types

- `GET /v1/entity-types`
- `GET /v1/entity-types/:id`
- `POST /v1/entity-types`
- `DELETE /v1/entity-types/:id`

`POST /v1/entity-types` body:
- `name` (string, required, max 50)
- `label` (string, required, max 100)

Capabilities:
- `query:read` for list/get
- `data:ingest` for create/delete

## 5.3 Documents

- `GET /v1/entities/:entityId/documents`
- `GET /v1/documents` (all workspace docs in key scope)
- `GET /v1/entities/:entityId/documents/:id`
- `POST /v1/entities/:entityId/documents`
- `POST /v1/entities/:entityId/documents/upload` (multipart proxy upload)
- `POST /v1/entities/:entityId/documents/upload/init` (presigned upload start)
- `POST /v1/entities/:entityId/documents/upload/complete` (presigned upload finalize)
- `DELETE /v1/entities/:entityId/documents/:id`
- `POST /v1/entities/:entityId/documents/:id/retry`
- `GET /v1/entities/:entityId/documents/:id/error`

`POST /v1/entities/:entityId/documents` body:
- `source_type` (`file|url|text|api`, required)
- `display_name` (string, required)
- `source_url` (string, optional)
- `raw_text` (string, optional)
- `visibility` (optional)
- `model_config_id` (UUID, optional)

`POST /v1/entities/:entityId/documents/upload/init` body:
- `file_name` (string, required)
- `file_size_bytes` (int >= 1, required)
- `content_type` (string, optional)
- `visibility` (optional)
- `model_config_id` (UUID, optional)

`POST /v1/entities/:entityId/documents/upload/complete` body:
- `upload_id` (UUID, required)
- `display_name` (string, optional)
- `visibility` (optional)
- `model_config_id` (UUID, optional)
- `checksum` (string, optional)

Important:
- Uploaded object size must exactly match `file_size_bytes` declared at `upload/init`

## 5.4 Models

- `GET /v1/models`
- `GET /v1/models/:id`
- `POST /v1/models`
- `PATCH /v1/models/:id`
- `DELETE /v1/models/:id`
- `GET /v1/model-definitions?type=...`

`POST /v1/models` / `PATCH /v1/models/:id` body (all fields optional on patch except id in path):
- `name` (string)
- `llm_model_id` (UUID)
- `embedding_model_id` (UUID)
- `provider_connection_id` (UUID, optional)
- `llm_provider_connection_id` (UUID, optional)
- `embedding_provider_connection_id` (UUID, optional)
- `entity_id` (UUID, optional)
- `system_prompt` (string, optional)
- `embedding_doc_prefix` (string, optional)
- `embedding_query_prefix` (string, optional)
- `temperature` (number, optional)
- `top_k` (number, optional)
- `chunk_strategy` (`fixed|sliding|semantic`, optional)
- `chunk_size` (number, optional)
- `chunk_overlap` (number, optional)
- `is_default` (boolean, optional)

## 5.5 Providers

- `GET /v1/providers`
- `GET /v1/providers/:id`
- `POST /v1/providers`
- `POST /v1/providers/:id/test`
- `DELETE /v1/providers/:id`

`POST /v1/providers` body:
- `provider` (string enum, required)
- `display_name` (string, required)
- `api_key` (string, required)
- `entity_id` (UUID, optional)
- `provider_config` (object, optional)

## 5.6 Query

- `POST /v1/query`
- `POST /v1/query/debug`

Body:
- `entityId` (UUID, required)
- `modelConfigId` (UUID, required)
- `query` (string, required)
- `topK` (number 1..20, optional)
- `includeParentScopes` (boolean, optional)

---

## 6. Upload and Capacity Model

Storage control is account-level by owner plan.

Example:
- Free: 1 workspace, 2GB total
- Pro: 3 workspaces, 15GB total
- Distribution across workspaces is dynamic

### 6.1 What counts to usage
Real user data only:
- entities
- documents/data source bytes
- chunks
- S3 files tied to completed or reserved uploads
- pending upload reservations (`upload/init` sessions)

Not counted:
- audit records
- access records
- API key metadata
- model/provider metadata

### 6.2 Hardening
Presigned flow is hardened with upload sessions:
- Capacity is reserved at `upload/init`
- `upload/complete` validates object presence and exact size
- stale/orphan sessions are cleaned by background job
- mismatched file size is rejected

This prevents bypassing capacity via raw S3 upload without completion.

---

## 7. Minimal cURL Examples

### 7.1 Public query

```bash
curl -X POST "$LAYERUM_API_URL/v1/query" \
  -H "Authorization: Bearer lyr_wk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "entityId":"<entity_uuid>",
    "modelConfigId":"<model_config_uuid>",
    "query":"What is inside docs?",
    "topK":8
  }'
```

### 7.2 Presigned upload flow

1) Init

```bash
curl -X POST "$LAYERUM_API_URL/v1/entities/<entityId>/documents/upload/init" \
  -H "Authorization: Bearer lyr_wk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "file_name":"manual.pdf",
    "file_size_bytes":123456,
    "content_type":"application/pdf"
  }'
```

2) Upload to S3 with returned `uploadUrl` + `fields` + file (`multipart/form-data`)

3) Complete

```bash
curl -X POST "$LAYERUM_API_URL/v1/entities/<entityId>/documents/upload/complete" \
  -H "Authorization: Bearer lyr_wk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "upload_id":"<upload_uuid>",
    "display_name":"manual.pdf"
  }'
```
