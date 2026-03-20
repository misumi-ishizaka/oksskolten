# Oksskolten Spec — Ollama LLM Provider

> [Back to Overview](./01_overview.md)

## Overview

Add Ollama as a self-hosted LLM provider. Ollama runs locally or on a private server and exposes an OpenAI-compatible chat completion API. This allows users to run summarization, translation, and chat entirely on their own hardware without sending data to external APIs.

## Motivation

- **Privacy**: Article content stays on the user's network; no data is sent to third-party APIs.
- **Cost**: No per-token charges. Useful for high-volume summarization/translation workloads.
- **Offline**: Works without internet access once models are downloaded.
- **Flexibility**: Users can run any GGUF model available in the Ollama library.

## Design

### OpenAI-Compatible API

Ollama exposes `/v1/chat/completions` that is compatible with the OpenAI SDK. The Ollama provider reuses the `openai` npm package with a custom `baseURL` pointing to the Ollama server. This avoids adding a new SDK dependency.

### Provider Registration

A new `ollama` provider is added to the existing LLM provider system:

- **Provider key**: `ollama`
- **API key**: Not required. `requireKey()` is a no-op, same as `claude-code`. Connection errors surface naturally when `createMessage`/`streamMessage` is called.
- **Base URL**: Stored as `ollama.base_url` in the settings DB. Defaults to `http://localhost:11434` if not set. No SSRF protection is needed since Oksskolten is a single-user self-hosted application where only the server owner can configure settings.
- **Client**: Uses the `openai` npm package with `baseURL` set to `{ollama.base_url}/v1` and a placeholder API key (`ollama`).

### Dynamic Model Discovery

Unlike other providers that have a static model list, Ollama models are user-installed and vary per instance. The provider discovers available models by calling the Ollama REST API:

```
GET {base_url}/api/tags
```

Response shape (relevant fields):

```json
{
  "models": [
    {
      "name": "llama3.2:latest",
      "size": 2019393189,
      "details": {
        "parameter_size": "3B",
        "family": "llama"
      }
    }
  ]
}
```

The model list endpoint is exposed via a new API route so the frontend can populate a dynamic model selector.

### Token Usage and Billing

Ollama returns token usage in the OpenAI-compatible response format (`usage.prompt_tokens`, `usage.completion_tokens`). These are recorded the same way as other providers. If the response omits usage data, zeros are recorded.

`AiBillingMode` in `server/fetcher/ai.ts` is extended with `'ollama'`. Since Ollama is local, pricing is zero. `getModelPricing()` returns `undefined` for dynamic Ollama models; the UI displays "Local" or "—" where cost would normally appear.

### Chat Adapter

The chat adapter reuses `runOpenAITurn()` from `adapter-openai.ts` by adding an optional `client` parameter. When the provider is `ollama`, `adapter.ts` passes the Ollama client to `runOpenAITurn()`. No separate `adapter-ollama.ts` is needed.

```typescript
// adapter.ts
if (provider === 'ollama') {
  const { runOpenAITurn } = await import('./adapter-openai.js')
  const { getOllamaClient } = await import('../providers/llm/ollama.js')
  return runOpenAITurn(params, getOllamaClient())
}

// adapter-openai.ts — signature change
export async function runOpenAITurn(
  params: ChatTurnParams,
  client?: OpenAI,
): Promise<RunChatTurnResult> {
  const actualClient = client ?? getOpenAIClient()
  // ... rest unchanged, uses actualClient instead of getOpenAIClient()
}
```

### Streaming

Ollama supports streaming via the OpenAI-compatible SSE format. The `streamMessage()` implementation follows the same pattern as the OpenAI provider.

## Configuration

All Ollama settings are stored in the SQLite settings table, consistent with other providers. The base URL is saved via the existing preferences API (`PATCH /api/settings/preferences`) by adding `ollama.base_url` to `PREF_KEYS` and `PREF_ALLOWED` (with `null` to accept any string).

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `ollama.base_url` | string | `http://localhost:11434` | Ollama server address |
| `chat.provider` | string | — | Set to `ollama` to use Ollama for chat |
| `chat.model` | string | — | Ollama model name (e.g. `llama3.2:latest`) |
| `summary.provider` | string | — | Set to `ollama` for summarization |
| `summary.model` | string | — | Ollama model name |
| `translate.provider` | string | — | Set to `ollama` for translation |
| `translate.model` | string | — | Ollama model name |

### Settings UI

The settings page adds:

- A dedicated `OllamaCard` component (analogous to `ClaudeCodeCard`) under the LLM provider section. It displays a base URL text input (not a secret field) and a "Test Connection" button that calls `GET /api/settings/ollama/status`, showing success with version and model count, or an error message.
- When `ollama` is selected as a provider for any task, the model dropdown is populated dynamically from the Ollama instance instead of a static list.

#### Provider Button Behavior

Ollama is always shown as "configured" in the provider button group (no API key required). The `configuredKeys` map hardcodes `ollama: true`, similar to how `claude-code` checks `/api/chat/claude-code-status`.

#### Model Selection on Provider Switch

When the user switches to `ollama`, the frontend fetches `/api/settings/ollama/models` and auto-selects the first available model. The `ModelSelect` component branches internally: for `provider === 'ollama'`, it uses SWR to fetch the dynamic model list; for other providers, it uses the existing static `getModelGroups()` helper.

## Key Files

| File | Purpose |
|---|---|
| `server/providers/llm/ollama.ts` | Ollama LLM provider implementation |
| `server/providers/llm/index.ts` | Register `ollama` in the provider map |
| `server/chat/adapter.ts` | Add `ollama` routing case |
| `server/chat/adapter-openai.ts` | Add optional `client` parameter to `runOpenAITurn()` |
| `server/fetcher/ai.ts` | Add `'ollama'` to `AiBillingMode` union |
| `shared/models.ts` | Add Ollama to provider constants and label map |
| `server/routes/settings.ts` | Add `ollama` to allowed provider values, add Ollama API endpoints |
| `src/pages/settings/sections/provider-config-section.tsx` | Add `OllamaCard` component |
| `src/pages/settings/sections/task-model-section.tsx` | Dynamic model selector for Ollama, configuredKeys |
| `src/lib/i18n.ts` | Add `provider.ollama` and Ollama-related i18n keys |
| `server/providers/llm/ollama.test.ts` | Unit tests for Ollama provider |

## API Endpoints

### List Ollama Models

```
GET /api/settings/ollama/models
```

Proxies a request to `{ollama.base_url}/api/tags` and returns the model list. Returns `[]` if Ollama is unreachable.

Response:

```json
{
  "models": [
    { "name": "llama3.2:latest", "size": 2019393189, "parameter_size": "3B" },
    { "name": "gemma3:4b", "size": 3000000000, "parameter_size": "4B" }
  ]
}
```

### Test Ollama Connection

```
GET /api/settings/ollama/status
```

Checks connectivity to the configured Ollama server by calling `GET {base_url}/api/version` for the version string and `GET {base_url}/api/tags` for the model count.

Response:

```json
{ "ok": true, "version": "0.9.0", "model_count": 5 }
```

or

```json
{ "ok": false, "error": "Connection refused" }
```

## Provider Implementation Details

### `server/providers/llm/ollama.ts`

```typescript
import OpenAI from 'openai'
import { getSetting } from '../../db.js'
import type { LLMProvider, LLMMessageParams, LLMStreamResult } from './provider.js'

let cachedBaseUrl = ''
let cachedClient: OpenAI | null = null

export function getOllamaClient(): OpenAI {
  const baseUrl = getSetting('ollama.base_url') || 'http://localhost:11434'
  if (cachedClient && baseUrl === cachedBaseUrl) return cachedClient
  cachedBaseUrl = baseUrl
  cachedClient = new OpenAI({
    baseURL: `${baseUrl}/v1`,
    apiKey: 'ollama',  // Ollama ignores this but the SDK requires it
  })
  return cachedClient
}

export const ollamaProvider: LLMProvider = {
  name: 'ollama',

  requireKey() {
    // no-op: no API key needed (same pattern as claude-code)
  },

  async createMessage(params: LLMMessageParams): Promise<LLMStreamResult> {
    // Same implementation as openai.ts but using getOllamaClient()
  },

  async streamMessage(params: LLMMessageParams, onText: (delta: string) => void): Promise<LLMStreamResult> {
    // Same implementation as openai.ts but using getOllamaClient()
  },
}
```

### `adapter-openai.ts` Changes

`runOpenAITurn()` gains an optional `client` parameter. When provided, the API key check is skipped and the given client is used instead of `getOpenAIClient()`:

```typescript
export async function runOpenAITurn(
  params: ChatTurnParams,
  client?: OpenAI,
): Promise<RunChatTurnResult> {
  if (!client && !getSetting('api_key.openai')) {
    throw new Error('OPENAI_KEY_NOT_SET')
  }
  const actualClient = client ?? getOpenAIClient()
  // ... rest uses actualClient
}
```

### Model Validation

Since Ollama models are dynamic, the `validateProviderModel()` function in `settings.ts` skips model validation when provider is `ollama` (similar to `google-translate` and `deepl`).

### `shared/models.ts` Changes

- Add `ollama` to `DEFAULT_MODELS` with empty string (no static default).
- Add `ollama` to `PROVIDER_LABELS` with label key `provider.ollama`. The i18n value is `"Ollama"` in both English and Japanese.
- Add `ollama` to `LLM_TASK_PROVIDERS`.
- Add `ollama` to `SUB_AGENT_MODELS` with empty string (user must configure).
- `MODELS_BY_PROVIDER` does **not** include `ollama` (models are dynamic, not static).

## Error Handling

| Scenario | Behavior |
|---|---|
| Ollama server unreachable | `createMessage`/`streamMessage` throws with connection error; caller handles as usual |
| Model not found | Ollama returns 404; surfaced as provider error |
| Base URL not configured | Uses default `http://localhost:11434` |
| Streaming interrupted | Same handling as OpenAI provider (partial text returned) |
| Token usage missing | Record `0` for both input and output tokens |
| Model list fetch fails | `/api/settings/ollama/models` returns `{ models: [] }`; UI shows "Cannot connect to Ollama" message |

### Logging

No Ollama-specific log fields. The existing AI task logging records `provider`, `model`, `inputTokens`, and `outputTokens`, which is sufficient for Ollama as well.

## Test Plan

- **Unit tests** (`server/providers/llm/ollama.test.ts`):
  - `createMessage` sends correct request format and returns text + token counts
  - `streamMessage` accumulates streamed deltas and returns full text
  - Client is constructed with correct base URL from settings
  - Default base URL is used when setting is absent
  - `requireKey` does not throw (no API key required)
- **Integration**: Manual test with a locally installed Ollama instance. Not required for CI. Docker Compose is not modified; developers install Ollama on their machine and run `ollama serve` for manual testing.

## Out of Scope

- **Pull models from UI**: Users must install models via `ollama pull` on the command line. The UI only lists already-installed models.
- **GPU/resource monitoring**: No visibility into Ollama's resource usage from within Oksskolten.
- **Model-specific parameters**: Temperature, top-p, and other sampling parameters are not configurable per-provider in the current architecture; this applies equally to Ollama.
- **Ollama embeddings API**: Only the chat completions API is used. Embeddings for similarity search remain handled by Meilisearch.

## Current Status

Interview complete. Ready for implementation.

Implementors MUST keep this section updated as they work.

### Checklist

- [ ] `shared/models.ts` — Add `ollama` to `DEFAULT_MODELS`, `PROVIDER_LABELS`, `LLM_TASK_PROVIDERS`, `SUB_AGENT_MODELS`
- [ ] `server/providers/llm/ollama.ts` — Ollama LLM provider with cached client
- [ ] `server/providers/llm/ollama.test.ts` — Unit tests for Ollama provider
- [ ] `server/providers/llm/index.ts` — Register `ollama` in provider map
- [ ] `server/fetcher/ai.ts` — Add `'ollama'` to `AiBillingMode`
- [ ] `server/chat/adapter-openai.ts` — Add optional `client` param to `runOpenAITurn()`
- [ ] `server/chat/adapter.ts` — Add `ollama` routing case
- [ ] `server/routes/settings.ts` — Add `ollama` to `PREF_KEYS`/`PREF_ALLOWED`, add `/api/settings/ollama/models` and `/api/settings/ollama/status` endpoints, skip model validation for `ollama`
- [ ] `src/lib/i18n.ts` — Add `provider.ollama` and Ollama UI i18n keys
- [ ] `src/pages/settings/sections/provider-config-section.tsx` — Add `OllamaCard` component
- [ ] `src/pages/settings/sections/task-model-section.tsx` — Dynamic model selector for Ollama, `configuredKeys['ollama'] = true`

### Updates

- 2026-03-20: Spec interview completed. All design decisions documented.
