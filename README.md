# Nylon Pay TypeScript SDK

Server-side SDK for integrating Nylon Pay into merchant applications. Supports TypeScript and JavaScript (ESM and CJS).

This package is the reference implementation of the [Nylon Pay SDK Spec](https://github.com/nile-squad/specs/blob/main/nylonpay-sdk-spec/spec.md), the canonical, language-agnostic contract for building Nylon Pay SDKs in any language.

[Full documentation](https://docs.nylonpay.nilesquad.com/docs)

## Install

```bash
npm install @nile-squad/nylonpay-ts
```

## Quick Start

```ts
import { createNylonPay } from "@nile-squad/nylonpay-ts";

const nylonpay = createNylonPay({
  apiKey: "npk_...",
  apiSecret: "nps_...",
});

const payment = await nylonpay.collectPayment({
  amount: 10000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Order #1234",
});

payment.on("success", ({ transaction }) => fulfillOrder(transaction));
payment.on("failed", ({ error }) => notifyCustomer(error));
```

## Configuration

Use your test keys to work in sandbox, or your production keys to go live. There is no separate `environment` option, the key determines the mode.

| Option | Required | Default | Description |
|---|---|---|---|
| `apiKey` | Yes | | Must start with `npk_` |
| `apiSecret` | Yes | | Must start with `nps_` |
| `baseUrl` | No | Default is used | Override for a custom endpoint |
| `timeoutMs` | No | `30000` | Request timeout in milliseconds |
| `maxRetries` | No | `3` | Retry count for failed requests |
| `maxPollIntervalMs` | No | `2000` | Polling interval for async payments |
| `maxPollDurationMs` | No | *(none)* | Optional cap on total polling time. Omit to wait until terminal. |
| `maxPollAttempts` | No | *(none)* | Optional cap on poll count. Omit to wait until terminal. |
| `onDelayed` | No | `"wait"` | `"return"` hands back a delayed still-pending payment; `"wait"` keeps polling |

## Operations

### collectPayment

Initiate a payment collection. Returns a `PaymentInstance` with event-driven updates.

```ts
const payment = await nylonpay.collectPayment({
  amount: 10000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Order #1234",
  method: "mobileMoney",
  reference: "550e8400-e29b-41d4-a716-446655440000",
});

payment.on("success", ({ transaction }) => { /* ... */ });
payment.on("failed", ({ error }) => { /* ... */ });
```

`reference` is optional and auto-generated if omitted. A supplied reference must be
a valid UUID (any version); the SDK throws a `validation` error otherwise. Omit the
field to auto-generate a UUID v4.

### collectPaymentAndResolve

Block until the collection reaches a terminal state. Single request and response, no client-side polling.

```ts
const result = await nylonpay.collectPaymentAndResolve({
  amount: 5000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Quick payment",
});

if (result.isOk) console.log("Paid:", result.value.reference);
```

### makePayout

Disburse funds to a destination account.

```ts
const payout = await nylonpay.makePayout({
  amount: 50000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  destination: { accountHolderName: "Jane Doe", accountNumber: "123456" },
  description: "Refund for order #1234",
});

const tx = await payout.wait();
```

### makePayoutAndResolve

Block until the payout reaches a terminal state. Single request and response.

```ts
const result = await nylonpay.makePayoutAndResolve({
  amount: 50000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  destination: { accountHolderName: "Jane Doe", accountNumber: "123456" },
  description: "Refund",
});
```

## Payout Lifecycle

`makePayout` returns immediately with a `reference` for tracking and idempotent retries. The payout status flows through several stages:

- **`pending`**, Payout accepted and queued for processing
- **`processing`**, Provider is actively handling the disbursement
- **`on_hold`**, Payout is under review (liquidity or compliance checks). Non-terminal; will complete to `successful`, `failed`, or `cancelled`.
- **`successful`**, Payout completed; funds sent to destination
- **`failed`**, Payout failed; funds refunded to merchant account
- **`cancelled`**, Payout was cancelled by the merchant

**Polling and webhooks:** Monitor payout progress by:
1. Subscribing to `"processing"` events (covers `pending`, `processing`, and `on_hold` states)
2. Listening for terminal events: `"success"`, `"failed"`, `"cancelled"`
3. Receiving webhook notifications at your configured endpoint

The SDK treats `on_hold` as a non-terminal status, polling continues automatically until the payout reaches a terminal state. Use the `statusText` field for human-readable details about review holds.

```ts
const payout = await nylonpay.makePayout({ /* ... */ });

payout.on("processing", ({ reference, transaction }) => {
  // Payout is in flight (pending, processing, or on_hold)
  if (transaction?.status === "on_hold") {
    console.log("Payout under review:", transaction.statusText);
    // "Payout is being reviewed and will complete shortly"
  }
});

payout.on("success", ({ transaction }) => {
  console.log("Payout complete:", transaction?.reference);
});

// Or wait for terminal state
const tx = await payout.wait();
if (tx) {
  console.log("Final status:", tx.status);
}
```

### getStatus

One-shot status check for a transaction. Does not poll, returns the current server-side state.

```ts
const result = await nylonpay.getStatus({ reference: "550e8400-e29b-41d4-a716-446655440000" });
if (result.isOk) console.log(result.value.status);
```

### getTransaction

Look up a full transaction record by `id` or `reference`. At least one must be provided.

```ts
const result = await nylonpay.getTransaction({ reference: "550e8400-e29b-41d4-a716-446655440000" });
if (result.isOk) console.log(result.value.failureReason);
```

### verifyPhone

Pre-validate a phone number and get the registered name.

```ts
const result = await nylonpay.verifyPhone({ phoneNumber: "+256700000000" });
if (result.isOk && result.value.verified) {
  console.log("Registered to:", result.value.customerName);
}
```

### createInvoice

Generate a hosted payment link. Card payments are only supported via this hosted flow.

```ts
const result = await nylonpay.createInvoice({
  amount: 25000,
  currency: "UGX",
  description: "Monthly subscription",
  items: [{ name: "Pro Plan", quantity: 1, unitPrice: 25000 }],
  redirectUrl: "https://myapp.com/thank-you",
});

if (result.isOk) sendEmail(result.value.url);
```

### verifyWebhookSignature

Verify incoming webhook payloads before processing.

```ts
app.post("/webhooks", (req, res) => {
  const isValid = nylonpay.verifyWebhookSignature({
    payload: req.rawBody,
    signature: req.headers["x-nylon-signature"],
    secret: "nps_...",
  });

  if (!isValid) return res.status(401).send("Invalid signature");
});
```

## PaymentInstance Events

`collectPayment` and `makePayout` return a `PaymentInstance` with event-driven updates. The SDK automatically polls for status changes and emits events as the transaction progresses.

| Event | Description |
|---|---|
| `processing` | Transaction is being processed (covers `pending`, `processing`, and `on_hold` states) |
| `success` | Transaction completed successfully |
| `failed` | Transaction failed |
| `cancelled` | Transaction was cancelled |
| `error` | Network or polling error |

For payouts specifically, `on_hold` indicates the payout is under review (liquidity or compliance checks). Polling continues automatically; use `transaction?.statusText` for a human-readable explanation.

```ts
payment.on("success", ({ transaction }) => { /* ... */ });
payment.once("success", ({ transaction }) => { /* fires once */ });
payment.off("success", handler);

const tx = await payment.wait();
```

**Delayed payments (v1.5+):** By default `wait()` keeps polling until the payment finishes. After about three minutes in flight, status responses include `delayed: true`. To hand control back early and rely on webhooks instead:

```ts
const nylonpay = createNylonPay({
  apiKey: "npk_...",
  apiSecret: "nps_...",
  onDelayed: "return",
});

const tx = await nylonpay.collectPaymentAndResolve({ /* ... */ });
if (tx.isOk && tx.value.delayed && tx.value.status === "pending") {
  // Payment still in flight, listen for webhooks
}
```

Set `maxPollDurationMs` if you want the previous ~5 minute timeout behavior.

Use `safeTry` from `slang-ts` to handle the promise without try/catch:

```ts
import { safeTry } from "slang-ts";

const result = await safeTry(() => payment.wait());
if (result.isOk) {
  console.log("paid:", result.value.reference);
} else {
  console.log("failed or timed out:", result.error);
}
```

## Error Handling

All operations return `Result<T, string>` from [slang-ts](https://github.com/Hussseinkizz/slang-ts). Use `parseError` to get structured error objects.

```ts
import { parseError } from "@nile-squad/nylonpay-ts";

const result = await nylonpay.getStatus({ reference: "550e8400-e29b-41d4-a716-446655440000" });
if (!result.isOk) {
  const error = parseError(result.error);
  if (error.retryable) {
    // retry
  }
}
```

## Supported Currencies

`USD`, `EUR`, `GBP`, `KES`, `UGX`, `TZS`, `RWF`

## Links

- [Documentation](https://docs.nylonpay.nilesquad.com/docs)
- [SDK Spec](https://github.com/nile-squad/specs/blob/main/nylonpay-sdk-spec/spec.md)
- [GitHub Repository](https://github.com/nile-squad/nylonpay-ts)
- [Python SDK](https://github.com/nile-squad/nylonpay-py)
- [Nylon Pay](https://nylonpay.nilesquad.com)

## License

MIT
