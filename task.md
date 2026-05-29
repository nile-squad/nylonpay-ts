# TypeScript SDK Implementation — Spec Compliance Rewrite

## Goal
Rewrite the TypeScript SDK at `packages/sdks/typescript/` to fully comply `docs/sdk-spec.md` (v1.0.0).

## Current State
- 3 of 9 operations implemented (`collectPayment`, `getStatus`, `createInvoice`) — all with wrong types and wrong transport
- Transport sends to `{baseUrl}/{action}` — spec requires Nile.js envelope to single endpoint
- Types don't match spec (customer shape, transaction shape, status response, etc.)
- Missing: `makePayout`, `makePayoutAndResolve`, `collectPaymentAndResolve`, `getTransaction`, `verifyPhone`, `verifyWebhookSignature`
- Config validation missing `npk_`/`nps_` prefix checks
- Reference is required + UUID-only — spec says optional + auto-generated

## Phase 1: Foundation
**Files:** `types.ts`, `sdk.config.ts` (new), `transport.ts`, `create-nylon-pay.ts`, `verify-webhook.ts` (new)

### types.ts — Rewrite to match spec exactly
- Use `type` over `interface` (AGENTS.md)
- All spec types: `SdkEnvironment`, `TransactionStatus`, `TransactionType`, `PaymentMethod`, `TransactionMode`, `PaymentEvent`, `WebhookEventType`, `Currency`, `NylonPayConfig`, `Customer`, `Destination`, `InvoiceItem`, `BankDetails`, `CollectPaymentInput`, `MakePayoutInput`, `GetStatusInput`, `GetTransactionInput`, `VerifyPhoneInput`, `CreateInvoiceInput`, `VerifyWebhookInput`, `Transaction`, `StatusResponse`, `PhoneVerification`, `InvoiceResponse`, `WebhookPayload`
- Internal types: `SdkAuthHeaders`, `SdkError`, `TransportRequest`, `TransportResult`, `SignaturePayload`, `NylonPaySdk` (interface for SDK instance), `PaymentInstance`, `EventData`, `PaymentEventHandler`
- `NylonPayConfig` includes optional `fetch` override (not in spec but useful for testing)

### sdk.config.ts — New file, internal defaults + action mapping
```
DEFAULT_BASE_URL = "https://api.nylonpay.io/api/services"
DEFAULT_TIMEOUT_MS = 30000
DEFAULT_MAX_RETRIES = 3
DEFAULT_MAX_POLL_INTERVAL_MS = 2000
DEFAULT_MAX_POLL_DURATION_MS = 300000
DEFAULT_MAX_POLL_ATTEMPTS = 150

SDK_SERVICE = "sdk"

ACTION_MAP:
  collectPayment → sdk-collect-payment
  collectPaymentAndResolve → sdk-collect-payment-and-resolve
  makePayout → sdk-make-payout
  makePayoutAndResolve → sdk-make-payout-and-resolve
  getStatus → sdk-get-status
  getTransaction → sdk-get-transaction
  verifyPhone → sdk-verify-phone
  createInvoice → sdk-create-invoice
```

### transport.ts — Rewrite for Nile.js envelope
- All requests POST to `{baseUrl}` (single endpoint)
- Request body: `{ intent: "execute", service: "sdk", action: "<action-name>", payload: { ...payload, _fingerprint } }`
- `send()` accepts `{ action: string, payload: unknown }` — no more `requiresAuth` (all SDK ops are authed)
- Response envelope: `{ status: boolean, message: string, data: T }`
  - `status === true` → extract `data`, verify `_responseSignature` within data, return `Ok(data)`
  - `status === false` → parse `message` as JSON-serialized SdkError, return `Err(error)`
- **Retry: build request ONCE (body + headers), reuse on retry** (same nonce, same signature per spec)
- Retryable: 408, 429, 500, 502, 503, 504
- Backoff: `2^attempt * 1000 + random(0-500)` ms
- Strip `_responseSignature` from data before verification, then verify remaining data

### create-nylon-pay.ts — Update validation
- Validate `apiKey` starts with `npk_`
- Validate `apiSecret` starts with `nps_`
- Validate `environment` is `"sandbox"` or `"live"`
- Merge defaults from `sdk.config.ts`
- Throw on invalid config (programmer error)

### verify-webhook.ts — New file
- `verifyWebhookSignature({ payload, signature, secret })` → boolean
- HMAC-SHA256 on raw payload bytes (string or Uint8Array)
- Constant-time comparison via `timingSafeEqual`
- Operates on raw bytes, NOT parsed JSON (spec invariant #8)

## Phase 2: Implementation
**Files:** `sdk.ts`, `payment.ts`

### sdk.ts — All 9 operations
Each operation:
1. Validate input (throw on programmer errors like missing required fields)
2. Auto-generate `reference` if omitted (crypto.randomBytes → hex, 15 chars)
3. Call `transport.send({ action: ACTION_MAP[operation], payload: input })`
4. Return `Result<T, SdkError>` for sync ops, `PaymentInstance` for async ops

Operations:
- `collectPayment(input: CollectPaymentInput)` → `Promise<PaymentInstance>`
- `collectPaymentAndResolve(input: CollectPaymentInput)` → `Promise<Result<Transaction, SdkError>>`
- `makePayout(input: MakePayoutInput)` → `Promise<PaymentInstance>`
- `makePayoutAndResolve(input: MakePayoutInput)` → `Promise<Result<Transaction, SdkError>>`
- `getStatus(input: GetStatusInput)` → `Promise<Result<StatusResponse, SdkError>>`
- `getTransaction(input: GetTransactionInput)` → `Promise<Result<Transaction, SdkError>>`
- `verifyPhone(input: VerifyPhoneInput)` → `Promise<Result<PhoneVerification, SdkError>>`
- `createInvoice(input: CreateInvoiceInput)` → `Promise<Result<InvoiceResponse, SdkError>>`
- `verifyWebhookSignature(input: VerifyWebhookInput)` → `boolean`

### payment.ts — Update for new types
- `createPaymentInstance` accepts initial response with `reference` and `status`
- `fetchStatus` callback uses new `StatusResponse` shape (flat: `{ reference, status, amount, currency, updatedAt }`)
- But wait() resolves with full `Transaction` — need to reconcile
- Actually: PaymentInstance polls `getStatus` which returns `StatusResponse`. On terminal state, it should fetch full `Transaction` via `getTransaction`. OR: the `StatusResponse` from the server might include full transaction data. Need to check backend.
- Events: `processing`, `success`, `failed`, `cancelled`, `error` (same as current)
- Polling: uses `maxPollIntervalMs` from config

## Phase 3: Polish
**Files:** `index.ts`, test files

### index.ts — Export all public types + factory
- `createNylonPay` (factory)
- `verifyWebhookSignature` (standalone utility)
- `parseError` (utility)
- All public types from spec

### Tests — Rewrite covering spec requirements
- Config validation (valid, missing fields, invalid prefixes)
- Request signing (canonical payload, HMAC, nonce)
- Response verification (valid, tampered)
- Each operation happy path (mocked transport)
- PaymentInstance lifecycle (events, polling, terminal states, timeout, reference mismatch)
- Retry behavior (retryable/non-retryable codes, backoff)
- Webhook verification (valid, invalid, tampered)
- Edge cases from spec (zero amounts, empty strings, missing fields, etc.)

## Key Decisions
1. **Transport envelope**: All requests go through single endpoint with `{ intent, service, action, payload }`
2. **Resolve variants**: Server-side blocking — single request/response, no client polling
3. **Reference auto-generation**: `crypto.randomBytes(16).toString('hex').slice(0, 15)` — no external deps
4. **Retry identity**: Same request body + headers reused on retry (same nonce, same signature)
5. **Error shape**: Server `message` field is JSON-serialized SdkError — transport parses it
6. **`type` over `interface`**: Per AGENTS.md, except for SDK instance interface

## Files Modified
- `src/types.ts` — full rewrite
- `src/sdk.config.ts` — new
- `src/transport.ts` — full rewrite
- `src/create-nylon-pay.ts` — update validation
- `src/verify-webhook.ts` — new
- `src/sdk.ts` — full rewrite
- `src/payment.ts` — update types
- `src/index.ts` — update exports
- `src/*.test.ts` — rewrite

## Files Unchanged
- `src/signature.ts` — already correct
- `src/fingerprint.ts` — already correct
- `src/nonce.ts` — already correct
- `src/verify-response.ts` — already correct
- `src/pubsub.ts` — already correct
