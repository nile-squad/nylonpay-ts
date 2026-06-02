import type { Result } from "slang-ts";

/**
 * Lifecycle states a transaction can occupy. Merchants use these to drive
 * fulfillment logic: trigger order completion on "successful", notify
 * customer on "failed", release inventory on "cancelled".
 */
export type TransactionStatus =
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled";

/**
 * Broad transaction categories. Distinguishes collections from payouts
 * so merchants can route webhooks and reports to the right subsystems.
 */
export type TransactionType =
  | "collection"
  | "payout"
  | "transfer"
  | "escrow"
  | "refund"
  | "reversal"
  | "charge"
  | "chargeback";

/**
 * Supported payment rails. Mobile money is the default for most East African
 * integrations; bank transfers are used for larger-ticket collections or
 * payouts to corporate accounts.
 */
export type PaymentMethod = "mobileMoney" | "bank";

/**
 * Transaction execution mode. Test transactions are routed through sandbox
 * providers and do not deduct real funds. Live transactions use production
 * provider credentials.
 */
export type TransactionMode = "test" | "live";

/**
 * Events emitted by a PaymentInstance as a transaction progresses.
 * Merchants subscribe to these to react to status changes without
 * manually polling.
 */
export type PaymentEvent =
  | "processing"
  | "success"
  | "failed"
  | "cancelled"
  | "error";

/**
 * Webhook event types delivered to the merchant's configured endpoint.
 * Merchants use these to update internal order state, send customer
 * notifications, and reconcile ledgers without polling.
 */
export type WebhookEventType =
  | "collection.completed"
  | "collection.failed"
  | "payout.completed"
  | "payout.failed"
  | "payout.reversed"
  | "refund.completed"
  | "chargeback.received";

/**
 * Currencies supported by the platform. Merchants should use the currency
 * matching their settlement account to avoid FX surprises.
 */
export type Currency = "USD" | "EUR" | "GBP" | "KES" | "UGX" | "TZS" | "RWF";

/**
 * Customer details attached to a payment. The phone number is the primary
 * identity for mobile-money collections; email is optional and used for
 * receipts when available.
 */
export type Customer = {
  name: string;
  phoneNumber: string;
  email?: string;
};

/**
 * Destination account for a payout. The account holder name must match
 * KYC records to reduce reversal risk.
 */
export type Destination = {
  accountHolderName: string;
  accountNumber: string;
  bankName?: string;
  phone?: string;
};

/**
 * Line item for an invoice. Merchants use these to render itemized
 * breakdowns on the hosted payment page.
 */
export type InvoiceItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Bank account details required when the payment method is "bank".
 */
export type BankDetails = {
  accountNumber: string;
  bankName: string;
};

/**
 * Input for initiating a collection. The SDK abstracts provider routing,
 * so the merchant only specifies what to collect, from whom, and how.
 */
export type CollectPaymentInput = {
  amount: number;
  currency: Currency;
  customer: Customer;
  description: string;
  reference?: string;
  method?: PaymentMethod;
  bank?: BankDetails;
  metadata?: Record<string, string>;
};

/**
 * Input for initiating a payout. Use this to disburse funds to a
 * customer's bank account or mobile-money wallet.
 */
export type MakePayoutInput = {
  amount: number;
  currency: Currency;
  customer: Customer;
  destination: Destination;
  description: string;
  reference?: string;
  metadata?: Record<string, string>;
};

/**
 * Input for a one-shot status check. Does not start polling; returns
 * the current server-side state of the transaction.
 */
export type GetStatusInput = { reference: string };

/**
 * Input for looking up a full transaction record. At least one of
 * `id` or `reference` must be provided.
 */
export type GetTransactionInput = { id?: string; reference?: string };

/**
 * Input for phone-number pre-validation. Returns the registered name
 * on the account so merchants can confirm customer identity before
 * initiating a collection or payout.
 */
export type VerifyPhoneInput = {
  phoneNumber: string;
  purpose?: "collection" | "payout";
};

/**
 * Input for creating a hosted invoice. The returned URL can be shared
 * with customers; card payments are only supported via this hosted
 * flow to keep the merchant out of PCI scope.
 */
export type CreateInvoiceInput = {
  amount: number;
  currency: Currency;
  description: string;
  items?: InvoiceItem[];
  redirectUrl?: string;
  reference?: string;
  metadata?: Record<string, string>;
};

/**
 * Input for verifying a webhook signature. Operates on raw payload bytes
 * to avoid re-serialization altering the signed content.
 */
export type VerifyWebhookInput = {
  payload: string | Uint8Array;
  signature: string;
  secret: string;
};

/**
 * Full transaction record returned by lookups, event handlers, and the
 * blocking resolve variants. Contains everything a merchant needs to
 * reconcile without leaking internal provider details.
 */
export type Transaction = {
  id: string;
  reference: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  type: TransactionType;
  method: PaymentMethod;
  description: string;
  phone: string;
  email: string | null;
  failureReason: string | null;
  metadata: Record<string, string>;
  mode: TransactionMode;
  createdAt: string;
  updatedAt: string;
};

/**
 * Lightweight status response for quick checks. Use when you only need
 * the current state, not the full transaction record.
 */
export type StatusResponse = {
  reference: string;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  updatedAt: string;
};

/**
 * Result of a phone verification call. `verified` is true when the
 * provider confirms the number is active and the returned name matches
 * expectations.
 */
export type PhoneVerification = {
  phoneNumber: string;
  customerName: string;
  verified: boolean;
};

/**
 * Response from creating an invoice. The `url` is customer-facing;
 * the `token` can be used to idempotently re-fetch the invoice state.
 */
export type InvoiceResponse = {
  id: string;
  url: string;
  token: string;
  expiresAt: string;
  status: "pending";
};

/**
 * Structured payload delivered to the merchant's webhook endpoint.
 * Merchants should verify the signature before trusting the data.
 */
export type WebhookPayload = {
  event: WebhookEventType;
  data: Transaction;
  timestamp: string;
  signature: string;
};

/**
 * SDK configuration supplied by the merchant at initialization.
 * All timeouts and retry limits are configurable for different
 * network environments.
 *
 * Test vs. live mode is determined by the API key, not by config — a sandbox
 * key routes to test providers, a live key processes real money.
 */
export type NylonPayConfig = {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxPollIntervalMs?: number;
  maxPollDurationMs?: number;
  maxPollAttempts?: number;
  fetch?: typeof globalThis.fetch;
  /** Force a new instance even if one already exists for this key+url pair. */
  force?: boolean;
};

/**
 * Auth headers sent with every signed request. The backend uses these
 * to verify identity, freshness, and request integrity.
 * @internal
 */
export type SdkAuthHeaders = {
  "x-nylon-key": string;
  "x-nylon-nonce": string;
  "x-nylon-signature": string;
  "x-nylon-timestamp": string;
};

/**
 * Structured error returned by SDK operations. `code` is machine-readable
 * for branching logic; `message` is human-readable for logs and alerts.
 * `retryable` tells the merchant whether the same request may succeed
 * on re-invocation.
 * @internal
 */
export type SdkError = {
  code: string;
  message: string;
  statusCode?: number;
  retryable?: boolean;
};

/**
 * Transport-level request envelope before wrapping in the Nile.js payload.
 * @internal
 */
export type TransportRequest = {
  action: string;
  payload: unknown;
};

/**
 * Result of a transport call. Because slang-ts only supports string errors
 * at the constructor level, the transport layer returns `Result<T, string>`
 * and callers use `parseError` to obtain a structured `SdkError`.
 * @internal
 */
export type TransportResult<T> = Result<T, string>;

/**
 * Data passed to every payment event handler. `transaction` is populated
 * for status-change events (`processing`, `success`, `failed`, `cancelled`);
 * `error` is populated for the `"error"` event (network failure, timeout,
 * reference mismatch).
 *
 * @example
 * ```ts
 * payment.on("success", (data: EventData) => {
 *   console.log(data.transaction?.reference); // "ORDER-123"
 *   console.log(data.timestamp);              // "2026-05-30T12:00:00.000Z"
 * });
 * ```
 */
export type EventData = {
  /** The event that triggered this handler. */
  event: PaymentEvent;
  /** Full transaction record. Present for status-change events. */
  transaction?: Transaction;
  /** Error message. Present for the `"error"` event. */
  error?: string;
  /** ISO 8601 timestamp of when the event was emitted. */
  timestamp: string;
};

/**
 * Callback signature for {@link PaymentInstance} event handlers.
 * Receives an {@link EventData} object with the event type, transaction
 * data (if available), and timestamp.
 */
export type PaymentEventHandler = (data: EventData) => void;

/**
 * SDK instance returned by the factory. Provides all payment operations
 * and the webhook verification utility.
 *
 * Using an interface here because it defines a contract of methods
 * that an object must satisfy, which is the idiomatic use of interface
 * per project conventions.
 */
export interface NylonPaySdk {
  /**
   * Initiate a payment collection from a customer's phone or bank account.
   * Returns a {@link PaymentInstance} that polls for status updates and emits
   * events (`processing`, `success`, `failed`, `cancelled`, `error`).
   *
   * Auto-generates an idempotency `reference` if omitted. Throws on invalid
   * input (zero amount, empty phone, bank method without bank details).
   *
   * @example
   * ```ts
   * const payment = await nylonpay.collectPayment({
   *   amount: 10000,
   *   currency: "UGX",
   *   customer: { name: "Jane", phoneNumber: "+256700000000" },
   *   description: "Order #1234",
   * });
   *
   * payment.on("success", ({ transaction }) => fulfillOrder(transaction));
   * payment.on("failed", ({ error }) => notifyCustomer(error));
   * ```
   */
  collectPayment(input: CollectPaymentInput): Promise<PaymentInstance>;

  /**
   * Initiate a collection and block until the transaction reaches a terminal
   * state. The server polls internally — this is a single request/response
   * call, not client-side polling. Use for CLI tools, serverless functions,
   * or simple scripts that don't need event-driven updates.
   *
   * @example
   * ```ts
   * const result = await nylonpay.collectPaymentAndResolve({
   *   amount: 5000,
   *   currency: "UGX",
   *   customer: { name: "Jane", phoneNumber: "+256700000000" },
   *   description: "Quick payment",
   * });
   *
   * if (result.isOk) console.log("Paid:", result.value.reference);
   * ```
   */
  collectPaymentAndResolve(
    input: CollectPaymentInput,
  ): Promise<Result<Transaction, string>>;

  /**
   * Initiate a disbursement to a destination account (bank or mobile money).
   * Returns a {@link PaymentInstance} that polls for status updates and emits
   * events as the payout progresses.
   *
   * Auto-generates an idempotency `reference` if omitted.
   *
   * @example
   * ```ts
   * const payout = await nylonpay.makePayout({
   *   amount: 50000,
   *   currency: "UGX",
   *   customer: { name: "Jane", phoneNumber: "+256700000000" },
   *   destination: { accountHolderName: "Jane Doe", accountNumber: "123456" },
   *   description: "Refund for order #1234",
   * });
   *
   * const tx = await payout.wait();
   * ```
   */
  makePayout(input: MakePayoutInput): Promise<PaymentInstance>;

  /**
   * Initiate a disbursement and block until the payout reaches a terminal
   * state. The server polls internally — single request/response call.
   *
   * @example
   * ```ts
   * const result = await nylonpay.makePayoutAndResolve({
   *   amount: 50000,
   *   currency: "UGX",
   *   customer: { name: "Jane", phoneNumber: "+256700000000" },
   *   destination: { accountHolderName: "Jane Doe", accountNumber: "123456" },
   *   description: "Refund",
   * });
   * ```
   */
  makePayoutAndResolve(
    input: MakePayoutInput,
  ): Promise<Result<Transaction, string>>;

  /**
   * One-shot status check for a transaction. Does not poll — returns the
   * current server-side state. Use for lightweight checks or when you
   * already have the reference from a webhook or previous call.
   *
   * @example
   * ```ts
   * const result = await nylonpay.getStatus({ reference: "ORDER-123" });
   * if (result.isOk) console.log(result.value.status); // "successful"
   * ```
   */
  getStatus(input: GetStatusInput): Promise<Result<StatusResponse, string>>;

  /**
   * Look up a full transaction record by `id` or `reference`. At least one
   * must be provided. Returns the complete transaction including failure
   * reason, metadata, and timestamps.
   *
   * @example
   * ```ts
   * const result = await nylonpay.getTransaction({ reference: "ORDER-123" });
   * if (result.isOk) console.log(result.value.failureReason);
   * ```
   */
  getTransaction(
    input: GetTransactionInput,
  ): Promise<Result<Transaction, string>>;

  /**
   * Pre-validate a phone number with the payment provider. Returns the
   * registered name on the account so you can confirm customer identity
   * before initiating a collection or payout.
   *
   * @example
   * ```ts
   * const result = await nylonpay.verifyPhone({ phoneNumber: "+256700000000" });
   * if (result.isOk && result.value.verified) {
   *   console.log("Registered to:", result.value.customerName);
   * }
   * ```
   */
  verifyPhone(
    input: VerifyPhoneInput,
  ): Promise<Result<PhoneVerification, string>>;

  /**
   * Generate a hosted payment link. The returned URL renders a payment page
   * where the customer completes the transaction — including card payments
   * (the only way to accept cards, keeping you out of PCI scope).
   *
   * Supports optional line items (max 50) for itemized breakdowns on the
   * payment page. Auto-generates `reference` if omitted.
   *
   * @example
   * ```ts
   * const result = await nylonpay.createInvoice({
   *   amount: 25000,
   *   currency: "UGX",
   *   description: "Monthly subscription",
   *   items: [{ name: "Pro Plan", quantity: 1, unitPrice: 25000 }],
   *   redirectUrl: "https://myapp.com/thank-you",
   * });
   *
   * if (result.isOk) sendEmail(result.value.url);
   * ```
   */
  createInvoice(
    input: CreateInvoiceInput,
  ): Promise<Result<InvoiceResponse, string>>;

  /**
   * Verify that an incoming webhook payload was signed by Nylon Pay.
   * Operates on raw payload bytes (string or Uint8Array), not parsed JSON,
   * to prevent re-serialization from altering the signed content.
   *
   * Call this in your webhook handler before trusting the event data.
   *
   * @example
   * ```ts
   * app.post("/webhooks", (req, res) => {
   *   const isValid = nylonpay.verifyWebhookSignature({
   *     payload: req.rawBody,
   *     signature: req.headers["x-nylon-signature"],
   *     secret: process.env.NYLONPAY_WEBHOOK_SECRET,
   *   });
   *
   *   if (!isValid) return res.status(401).send("Invalid signature");
   *   // Process the verified webhook event
   * });
   * ```
   */
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
}

/**
 * Event-driven handle for an async payment operation. Subscribe to status
 * transitions with `on`/`once`/`off`, or block until completion with `wait`.
 *
 * Using an interface here because it defines a contract of methods
 * that an object must satisfy, which is the idiomatic use of interface
 * per project conventions.
 */
export interface PaymentInstance {
  /** The transaction reference. Immutable after creation. */
  readonly reference: string;

  /** Current transaction status. `null` until the first poll resolves. */
  readonly status: TransactionStatus | null;

  /**
   * Register a handler for a payment event. Fires every time the event
   * occurs. Returns the instance for chaining.
   *
   * Events: `"processing"`, `"success"`, `"failed"`, `"cancelled"`, `"error"`
   *
   * @example
   * ```ts
   * payment.on("success", ({ transaction }) => fulfillOrder(transaction));
   * payment.on("error", ({ error }) => log.error(error));
   * ```
   */
  on(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;

  /**
   * Register a handler that fires at most once, then auto-unsubscribes.
   * Useful for one-shot terminal event handlers. Returns the instance.
   *
   * @example
   * ```ts
   * payment.once("success", ({ transaction }) => sendReceipt(transaction));
   * ```
   */
  once(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;

  /**
   * Remove a previously registered handler. Safe to call for a handler
   * that was never registered. Returns the instance.
   */
  off(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;

  /**
   * Block until the transaction reaches a terminal state. Resolves with
   * the full {@link Transaction} on success. Rejects on failure,
   * cancellation, or polling error.
   *
   * @example
   * ```ts
   * try {
   *   const tx = await payment.wait();
   *   console.log("Paid:", tx.amount, tx.currency);
   * } catch (err) {
   *   console.error("Payment did not succeed:", err.message);
   * }
   * ```
   */
  wait(): Promise<Transaction>;
}
