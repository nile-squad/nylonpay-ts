# Nylon Pay TypeScript SDK

Server-side SDK for integrating Nylon Pay into merchant applications. Supports TypeScript and JavaScript (ESM and CJS).

[Full documentation](https://docs.nylonpay.nilesquad.com/docs)

## Install

```bash
npm install @nylonpay/sdk
```

## Quick Start

```ts
import { createNylonPay } from "@nylonpay/sdk";

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

> Test vs. live mode is selected by your API key — a sandbox key routes to test
> providers, a live key processes real money. There is no `environment` option.

| Option | Required | Default | Description |
|---|---|---|---|
| `apiKey` | Yes | | Must start with `npk_` |
| `apiSecret` | Yes | | Must start with `nps_` |
| `baseUrl` | No | `https://api.nylonpay.io/api/services` | API endpoint |
| `timeoutMs` | No | `30000` | Request timeout in milliseconds |
| `maxRetries` | No | `3` | Retry count for failed requests |
| `maxPollIntervalMs` | No | `2000` | Polling interval for async payments |
| `maxPollDurationMs` | No | `300000` | Maximum polling duration in milliseconds |
| `maxPollAttempts` | No | `150` | Maximum polling attempts |

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
  reference: "ORDER-123",
});

payment.on("success", ({ transaction }) => { /* ... */ });
payment.on("failed", ({ error }) => { /* ... */ });
```

`reference` is optional and auto-generated if omitted.

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

### getStatus

One-shot status check for a transaction. Does not poll, returns the current server-side state.

```ts
const result = await nylonpay.getStatus({ reference: "ORDER-123" });
if (result.isOk) console.log(result.value.status);
```

### getTransaction

Look up a full transaction record by `id` or `reference`. At least one must be provided.

```ts
const result = await nylonpay.getTransaction({ reference: "ORDER-123" });
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
    secret: process.env.NYLONPAY_WEBHOOK_SECRET,
  });

  if (!isValid) return res.status(401).send("Invalid signature");
});
```

## PaymentInstance Events

`collectPayment` and `makePayout` return a `PaymentInstance` with event-driven updates.

| Event | Description |
|---|---|
| `processing` | Transaction is being processed |
| `success` | Transaction completed successfully |
| `failed` | Transaction failed |
| `cancelled` | Transaction was cancelled |
| `error` | Network or polling error |

```ts
payment.on("success", ({ transaction }) => { /* ... */ });
payment.once("success", ({ transaction }) => { /* fires once */ });
payment.off("success", handler);

const tx = await payment.wait();
```

## Error Handling

All operations return `Result<T, string>` from [slang-ts](https://github.com/nile-squad/slang-ts). Use `parseError` to get structured error objects.

```ts
import { parseError } from "@nylonpay/sdk";

const result = await nylonpay.getStatus({ reference: "ORDER-123" });
if (!result.isOk) {
  const error = parseError(result.error);
  if (error.retryable) {
    // Retry the request
  }
}
```

## Supported Currencies

`USD`, `EUR`, `GBP`, `KES`, `UGX`, `TZS`, `RWF`

## Development

Maintainer notes and pending work live in [`dev-note.md`](./dev-note.md).

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup
```

## License

MIT
