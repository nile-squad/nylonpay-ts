# Nylon Pay TypeScript SDK

Server-side SDK for integrating Nylon Pay into merchant applications. Supports TypeScript and JavaScript (ESM + CJS).

[Full documentation](https://docs.nylonpay.nilesquad.com/docs)

## Install

```bash
npm install @nylonpay/sdk
```

## Quick Start

```ts
import { createNylonPay } from "@nylonpay/sdk";

const nylonpay = createNylonPay({
  environment: "live",
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

| Option | Required | Default | Description |
|---|---|---|---|
| `environment` | Yes | — | `"sandbox"` or `"live"` |
| `apiKey` | Yes | — | Must start with `npk_` |
| `apiSecret` | Yes | — | Must start with `nps_` |
| `baseUrl` | No | `https://api.nylonpay.io/api/services` | API endpoint |
| `timeoutMs` | No | `30000` | Request timeout |
| `maxRetries` | No | `3` | Retry count for failed requests |
| `maxPollIntervalMs` | No | `2000` | Polling interval for async payments |
| `maxPollDurationMs` | No | `300000` | Max polling duration |
| `maxPollAttempts` | No | `150` | Max polling attempts |

## Operations

### Collect Payment

Initiate a payment collection. Returns a `PaymentInstance` with event-driven updates.

```ts
const payment = await nylonpay.collectPayment({
  amount: 10000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Order #1234",
  method: "mobileMoney",
  reference: "ORDER-123", // optional, auto-generated if omitted
});

payment.on("success", ({ transaction }) => { /* ... */ });
payment.on("failed", ({ error }) => { /* ... */ });
```

### Collect Payment and Resolve

Block until the collection reaches a terminal state. Single request/response.

```ts
const result = await nylonpay.collectPaymentAndResolve({
  amount: 5000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  description: "Quick payment",
});

if (result.isOk) console.log("Paid:", result.value.reference);
```

### Make Payout

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

### Make Payout and Resolve

Block until the payout reaches a terminal state.

```ts
const result = await nylonpay.makePayoutAndResolve({
  amount: 50000,
  currency: "UGX",
  customer: { name: "Jane", phoneNumber: "+256700000000" },
  destination: { accountHolderName: "Jane Doe", accountNumber: "123456" },
  description: "Refund",
});
```

### Get Status

One-shot status check for a transaction.

```ts
const result = await nylonpay.getStatus({ reference: "ORDER-123" });
if (result.isOk) console.log(result.value.status); // "successful"
```

### Get Transaction

Look up a full transaction record by `id` or `reference`.

```ts
const result = await nylonpay.getTransaction({ reference: "ORDER-123" });
if (result.isOk) console.log(result.value.failureReason);
```

### Verify Phone

Pre-validate a phone number and get the registered name.

```ts
const result = await nylonpay.verifyPhone({ phoneNumber: "+256700000000" });
if (result.isOk && result.value.verified) {
  console.log("Registered to:", result.value.customerName);
}
```

### Create Invoice

Generate a hosted payment link (required for card payments).

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

### Verify Webhook Signature

Verify incoming webhook payloads before processing.

```ts
app.post("/webhooks", (req, res) => {
  const isValid = nylonpay.verifyWebhookSignature({
    payload: req.rawBody,
    signature: req.headers["x-nylon-signature"],
    secret: process.env.NYLONPAY_WEBHOOK_SECRET,
  });

  if (!isValid) return res.status(401).send("Invalid signature");
  // Process the verified webhook event
});
```

## PaymentInstance Events

`collectPayment` and `makePayout` return a `PaymentInstance` that emits events:

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
payment.off("success", handler); // remove handler

const tx = await payment.wait(); // block until terminal state
```

## Error Handling

All operations return `Result<T, string>` from [slang-ts](https://github.com/nile-squad/slang-ts). Use `parseError` to get structured `SdkError` objects:

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

## License

MIT
