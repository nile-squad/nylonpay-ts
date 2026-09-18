# Changelog

## 2.1.0

Upgrading from 2.0.1.

### Added

- `nylonpay.on("unreachable", ({ reason }) => { ... })` fires when the host is offline or Nylon Pay looks down. A successful call skips further down-checks for about 5 minutes. If the last check is older than that, it checks again rather than treating Nylon as still down. After a failure, the next operation is checked before it is attempted. Handle this event and pause your own retries until it recovers.
- `getStatus` now returns `id`, `operatorTid`, `failureReason`, `failureCategory`, `failureCode`, `statusText`, and `delayed`.
- Transaction and webhook snapshots carry Nylon `failureCategory` / `failureCode`. Webhook collections send `type: "collection"` plus `legacyType: "charge"`.
- `testOutcome` accepts Nylon failure-code literals. `parseError` reads an optional `-- error-code:` suffix onto `SdkError.code`.
- Requests now send `x-nylon-features`, declaring what this client can parse. The backend withholds wire additions from clients that do not list them, so older releases keep receiving the message shape they were built against.
- `InvoiceResponse.invoiceNumber` may be `null`; `url` is a deprecated alias of `paymentLink`.
- `on_hold` is a non-terminal status. Review-stage payouts keep polling; `statusText` explains why.

### Changed

- `wait()` `onDelayed: "return"` now fires when the backend marks a pending payment delayed (default remains `"wait"`).

### Fixed

- Client-side `testOutcome` validation now accepts the same Nylon failure codes the backend does. Types already listed them; the runtime check still rejected anything except `"success"` and `"fail"`.

## 2.0.1

Upgrading from 2.0.0. No API or behavior changes, test coverage only.

### Added

- The spec's canonical signing conformance vectors V1–V7 now ship as a unit test
  (spec requirement S19). This package is the reference implementation, so the
  vectors were generated here and verified against the backend's verifier;
  pinning them keeps the reference from drifting away from the document the
  other SDKs are built against.

## 2.0.0

Upgrading from 1.5.0, the previously published release. (1.6.0 was prepared but
never published; its changes are included here.)

### Security

- **Signed responses are now bound to the request that asked for them.** The
  backend echoes the request's nonce inside the signed payload and the SDK
  requires it to match. Previously any response the backend had ever produced
  stayed validly signed forever, so anyone able to observe one, a compromised
  proxy, request/response logging, a cache, could replay a captured
  "successful" status onto a later poll for the same reference, and the SDK
  could not tell it from a live answer. **Requires a backend that echoes the
  nonce; it is deployed first.**
- **`toleranceSeconds: 0` no longer disables webhook replay protection.** It now
  means a tolerance of zero seconds, maximum strictness. Reaching for `0` to
  mean "strictest" previously turned the freshness check off entirely, silently.
- **The response body size cap is enforced while reading**, so an oversized
  body is never fully materialized in memory.

### Breaking

- **`InvoiceItem.amount` renamed to `unitPrice`.** The backend has always
  required `unitPrice`; the SDK type and the spec both said `amount`, so
  `createInvoice` with line items failed validation for every merchant who
  followed the documented shape. Rename the field in your item objects, the
  value is unchanged (price per unit, smallest currency unit).
- **`toleranceSeconds: 0` flips meaning** (see Security above). If you passed
  `0` to disable the freshness check, import and pass `DISABLE_FRESHNESS_CHECK`
  instead, otherwise stale webhooks start being rejected.
- **`WebhookTransactionSnapshot` field types now match what the backend
  actually sends.** `amount` and `currency` are `string | null`; `type`,
  `method`, and `mode` are `T | null`. These fields could always arrive null, the old types promised otherwise, so code that compiled was not necessarily
  correct. Add null handling where you read them. `transactionId` and `status`
  are always present, so use them to reconcile with `getStatus()`.
- **`WebhookTransactionSnapshot.statusText` removed.** The webhook payload never
  carried it. It remains on the `Transaction` shape, where it is genuinely sent.
- **`verifyWebhookSignature` rejects non-canonical signatures.** Signatures have
  one form on the wire: lowercase hex. An uppercased signature of the same value
  now returns `false`. Nylon Pay only ever emits lowercase, so this affects you
  only if your code re-cases the `x-nylon-signature` header before verifying, pass it through unmodified.

### Fixed

- **Byte payloads are hashed exactly as supplied.** `verifyWebhookSignature`
  previously decoded a `Uint8Array` to a string and re-encoded it before
  hashing, which rewrites any sequence that is not valid UTF-8 and fails a
  payload that is genuinely authentic.
- **Numeric-string timestamps are accepted**, matching the Python SDK. Both
  SDKs now agree on every timestamp shape.

### Added

- Webhook events, payload shape, and the `on_hold` / `under_review` statuses are
  documented in the published spec. Note that a payout parked for review emits
  no webhook until it resolves.

## 1.6.0

Prepared but never published. Additive `on_hold` / `under_review` statuses and
`statusText` on `Transaction`. Folded into 2.0.0.
