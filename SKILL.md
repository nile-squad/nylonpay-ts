---
name: nylonpay-ts
description: Use when integrating Nylon Pay into a server-side TypeScript/JavaScript app — collecting payments, sending payouts, checking transaction status, verifying phone numbers, creating hosted invoices, or verifying webhook signatures via the @nile-squad/nylonpay-ts SDK.
---

# Nylon Pay TypeScript SDK

Server-side SDK for Nylon Pay. ESM + CJS, Node >= 18. Published as
`@nile-squad/nylonpay-ts`.

## Setup

```bash
npm install @nile-squad/nylonpay-ts
```

```ts
import { createNylonPay } from "@nile-squad/nylonpay-ts";

const nylonpay = createNylonPay({
  apiKey: process.env.NYLONPAY_API_KEY!,    // must start with "npk_"
  apiSecret: process.env.NYLONPAY_API_SECRET!, // must start with "nps_"
});
```

- This is a **server-side** SDK. Never ship `apiSecret` to a browser or mobile client.
- Test vs. live mode is decided by the **key**, not a config flag. A sandbox key
  routes to test providers; a live key moves real money. There is no `environment` option.
- Amounts are in the currency's smallest tracked unit as an integer (e.g. `10000`).
- Supported currencies: `USD`, `EUR`, `GBP`, `KES`, `UGX`, `TZS`, `RWF`.

## Result type — read before writing any call

Every operation that returns data returns `Result<T, string>` from
[`slang-ts`](https://github.com/nile-squad/slang-ts). **Always branch on `isOk`
before touching `.value`.** Do not throw/try-catch around these.

```ts
const result = await nylonpay.getStatus({ reference: "ORDER-123" });
if (!result.isOk) {
  const error = parseError(result.error); // structured: { message, retryable, ... }
  if (error.retryable) { /* safe to retry */ }
  return;
}
console.log(result.value.status);
```

`parseError` is exported from the same package.

## Choosing an operation

| Goal | Use | Shape |
|---|---|---|
| Take money, react to live updates | `collectPayment` | returns a `PaymentInstance` (events) |
| Take money, just await the final state | `collectPaymentAndResolve` | returns `Result`, no client polling |
| Send money, react to live updates | `makePayout` | returns a `PaymentInstance` |
| Send money, just await the final state | `makePayoutAndResolve` | returns `Result` |
| One-shot status (no polling) | `getStatus` | `Result` |
| Full transaction record | `getTransaction` | `Result` (needs `id` or `reference`) |
| Pre-validate a phone / get name | `verifyPhone` | `Result` |
| Hosted payment link (only path for cards) | `createInvoice` | `Result` with `.url` |
| Authenticate an incoming webhook | `verifyWebhookSignature` | `boolean` |

**Prefer the `*AndResolve` variants** for simple request/response flows — they're a
single round-trip with no client-side polling. Reach for the event-driven
`PaymentInstance` only when you need progressive UI/status updates.

## Event-driven flow (`collectPayment` / `makePayout`)

```ts
const payment = await nylonpay.collectPayment({
  amount: 10000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Order #1234",
  method: "mobileMoney",
  reference: "ORDER-123", // optional, auto-generated if omitted
});

payment.on("success", ({ transaction }) => fulfillOrder(transaction));
payment.on("failed", ({ error }) => notifyCustomer(error));
// or: const tx = await payment.wait();
```

Events: `processing`, `success`, `failed`, `cancelled`, `error` (network/polling).
`.on` / `.once` / `.off` / `await .wait()` are available.

## Webhooks

Verify the signature **on the raw request body** before trusting any webhook:

```ts
const isValid = nylonpay.verifyWebhookSignature({
  payload: req.rawBody, // raw bytes/string, NOT the parsed JSON
  signature: req.headers["x-nylon-signature"],
  secret: process.env.NYLONPAY_WEBHOOK_SECRET,
});
if (!isValid) return res.status(401).send("Invalid signature");
```

## Gotchas

- Use the raw, unparsed body for `verifyWebhookSignature` — re-serialized JSON
  will fail verification.
- Card payments are only supported through the hosted `createInvoice` flow.
- Make payment requests **idempotent** by passing a stable `reference` you own.
- This SDK is the reference implementation of the language-agnostic
  [Nylon Pay SDK Spec](https://github.com/nile-squad/specs/blob/main/nylon-pay/sdk-spec.md);
  consult it for protocol-level questions.

## Maintaining this package

Internal maintainer notes (signing-conformance test, subtree publishing) live in
[`dev-note.md`](./dev-note.md). Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
