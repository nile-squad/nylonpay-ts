# Changelog

## 2.0.0

Upgrading from 1.5.0, the previously published release. (1.6.0 was prepared but
never published; its changes are included here.)

### Security

- **Signed responses are now bound to the request that asked for them.** The
  backend echoes the request's nonce inside the signed payload and the SDK
  requires it to match. Previously any response the backend had ever produced
  stayed validly signed forever, so anyone able to observe one — a compromised
  proxy, request/response logging, a cache — could replay a captured
  "successful" status onto a later poll for the same reference, and the SDK
  could not tell it from a live answer. **Requires a backend that echoes the
  nonce; it is deployed first.**
- **`toleranceSeconds: 0` no longer disables webhook replay protection.** It now
  means a tolerance of zero seconds — maximum strictness. Reaching for `0` to
  mean "strictest" previously turned the freshness check off entirely, silently.
- **The response body size cap is enforced while reading**, so an oversized
  body is never fully materialized in memory.

### Breaking

- **`toleranceSeconds: 0` flips meaning** (see Security above). If you passed
  `0` to disable the freshness check, import and pass `DISABLE_FRESHNESS_CHECK`
  instead — otherwise stale webhooks start being rejected.
- **`WebhookTransactionSnapshot` field types now match what the backend
  actually sends.** `amount` and `currency` are `string | null`; `type`,
  `method`, and `mode` are `T | null`. These fields could always arrive null —
  the old types promised otherwise, so code that compiled was not necessarily
  correct. Add null handling where you read them. `transactionId` and `status`
  are always present, so use them to reconcile with `getStatus()`.
- **`WebhookTransactionSnapshot.statusText` removed.** The webhook payload never
  carried it. It remains on the `Transaction` shape, where it is genuinely sent.
- **`verifyWebhookSignature` rejects non-canonical signatures.** Signatures have
  one form on the wire: lowercase hex. An uppercased signature of the same value
  now returns `false`. Nylon Pay only ever emits lowercase, so this affects you
  only if your code re-cases the `x-nylon-signature` header before verifying —
  pass it through unmodified.

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
