---
name: nylonpay-ts
description: Use when integrating Nylon Pay into a server-side TypeScript/JavaScript app, collecting payments, sending payouts, checking transaction status, verifying phone numbers, creating hosted invoices, or verifying webhook signatures via the @nile-squad/nylonpay-ts SDK.
---

# Nylon Pay TypeScript SDK

Server-side SDK for Nylon Pay. ESM + CJS, Node.js 18+. Published as
`@nile-squad/nylonpay-ts`.

Same product surface as the [Python](https://docs.nylonpay.nilesquad.com/docs/skills/python)
and [PHP](https://docs.nylonpay.nilesquad.com/docs/skills/php) SDKs. Method names here
are camelCase. Hub: [nylonpay-overview](https://github.com/nile-squad/nylonpay-overview).

## Setup

```bash
npm install @nile-squad/nylonpay-ts
```

```ts
import { createNylonPay, parseError } from "@nile-squad/nylonpay-ts";

const nylonpay = createNylonPay({
  apiKey: process.env.NYLONPAY_API_KEY!, // must start with "npk_"
  apiSecret: process.env.NYLONPAY_API_SECRET!, // must start with "nps_"
});
```

- Server-side only. Never ship `apiSecret` to a browser or mobile client.
- Test vs live mode comes from the **key**, not a config flag. Use your sandbox
  key for test transactions and your live key for real money. There is no
  `environment` option.
- Amounts are integers in the currency's smallest tracked unit (for example `10000`).
- Supported currencies: `USD`, `EUR`, `GBP`, `KES`, `UGX`, `TZS`, `RWF`.

## Result type, read before writing any call

Operations that return data use `Result<T, string>`. **Always branch on `isOk`
before touching `.value`.** Do not wrap these calls in try/catch for business
failures.

```ts
const result = await nylonpay.getStatus({
  reference: "550e8400-e29b-41d4-a716-446655440000",
});
if (!result.isOk) {
  const error = parseError(result.error); // { message, retryable, category, ... }
  if (error.retryable) {
    /* safe to retry */
  }
  return;
}
console.log(result.value.status);
```

`parseError` is exported from `@nile-squad/nylonpay-ts`.

## Choosing an operation

| Goal | Use | Shape |
|---|---|---|
| Take money, react to live updates | `collectPayment` | `PaymentInstance` (events) |
| Take money, await final state | `collectPaymentAndResolve` | `Result`, no client wait loop |
| Send money, react to live updates | `makePayout` | `PaymentInstance` |
| Send money, await final state | `makePayoutAndResolve` | `Result` |
| One-shot status | `getStatus` | `Result` |
| Full transaction record | `getTransaction` | `Result` (`id` or `reference`) |
| Pre-validate a phone / get name | `verifyPhone` | `Result` |
| Hosted payment link (cards) | `createInvoice` | `Result` with `.paymentLink` |
| Authenticate an incoming webhook | `verifyWebhookSignature` | `boolean` |

Prefer `*AndResolve` for simple request/response flows. Use the event-driven
`PaymentInstance` when you need progressive status updates.

## Event-driven flow

```ts
const payment = await nylonpay.collectPayment({
  amount: 10000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Order #1234",
  method: "mobileMoney",
  // optional; omit to auto-generate a UUID v4
  reference: "550e8400-e29b-41d4-a716-446655440000",
});

payment.on("success", ({ transaction }) => fulfillOrder(transaction));
payment.on("failed", ({ error }) => notifyCustomer(error));
const tx = await payment.wait(); // transaction or null, does not throw on failure
```

Events: `processing`, `success`, `failed`, `cancelled`, `error`.
Also: `.on` / `.once` / `.off` / `await .wait()`.

## Webhooks

Verify the signature on the **raw request body** before trusting any webhook:

```ts
const isValid = nylonpay.verifyWebhookSignature({
  payload: req.rawBody, // raw bytes/string, not re-serialized JSON
  signature: req.headers["x-nylon-signature"],
  secret: process.env.NYLONPAY_WEBHOOK_SECRET!,
});
if (!isValid) return res.status(401).send("Invalid signature");
```

## Gotchas

- Use the raw, unparsed body for `verifyWebhookSignature`.
- Card payments only through hosted `createInvoice` (read `.paymentLink`).
- Idempotency: pass a stable UUID `reference` you own, or omit it for an
  auto-generated UUID v4. Non-UUID values throw a `validation` error.
- This SDK follows the
  [Nylon Pay SDK Spec](https://github.com/nile-squad/specs/blob/main/nylonpay-sdk-spec/spec.md).

## Other language SDKs

| Language | Package | Agent skill |
|---|---|---|
| Python | [`nylonpay-py`](https://github.com/nile-squad/nylonpay-py) | [docs](https://docs.nylonpay.nilesquad.com/docs/skills/python) |
| PHP | [`nile-squad/nylonpay-php`](https://github.com/nile-squad/nylonpay-php) | [docs](https://docs.nylonpay.nilesquad.com/docs/skills/php) |

Public hub: [nylonpay-overview](https://github.com/nile-squad/nylonpay-overview).
Example prompts: [docs](https://docs.nylonpay.nilesquad.com/docs/skills/example-prompts).
