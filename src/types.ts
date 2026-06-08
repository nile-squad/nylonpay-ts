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
  /**
   * Replay-protection window in seconds. After the signature is verified, the
   * timestamp carried inside the signed body must be within this many seconds of
   * now, or verification fails. Defaults to 300 (5 minutes). Set to `0` to
   * disable the freshness check (not recommended — a captured webhook then
   * verifies forever).
   */
  toleranceSeconds?: number;
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
 * Called before a collect or payout payload is sent to the server.
 * Receives the full input (reference already set). Return a mutated copy to
 * override the payload, or return void/undefined to leave it unchanged.
 * Async hooks are awaited before the transport call proceeds.
 */
export type BeforeCollectHook = (
  input: CollectPaymentInput,
) => CollectPaymentInput | undefined | Promise<CollectPaymentInput | undefined>;

/**
 * Called after every collect call (both fire-and-forget and resolve variants)
 * regardless of outcome. Use for logging, analytics, or side-effects.
 * The result is normalized to `{ reference, status }` across both variants.
 * Return value is ignored.
 */
export type AfterCollectHook = (
  result: Result<{ reference: string; status: string }, string>,
  input: CollectPaymentInput,
) => void | Promise<void>;

/**
 * Called before a payout payload is sent to the server.
 * Same semantics as {@link BeforeCollectHook}.
 */
export type BeforePayoutHook = (
  input: MakePayoutInput,
) => MakePayoutInput | undefined | Promise<MakePayoutInput | undefined>;

/**
 * Called after every payout call (both fire-and-forget and resolve variants)
 * regardless of outcome.
 * Same semantics as {@link AfterCollectHook}.
 */
export type AfterPayoutHook = (
  result: Result<{ reference: string; status: string }, string>,
  input: MakePayoutInput,
) => void | Promise<void>;

/**
 * Wrapper applied to every lifecycle hook. The SDK runs `fn` inside `safeTry`,
 * so a throw or rejection in merchant code never bubbles into the payment flow —
 * it is routed to `onError` instead.
 *
 * WHY `onError` is required: an unhandled hook failure in a payments SDK is the
 * worst kind of silent bug (the payment "succeeds" while a wallet credit or
 * fulfillment side-effect was lost). Forcing the merchant to declare what
 * happens on failure replaces both the old "throw and maybe crash" behaviour and
 * a silent `catch {}` with an explicit, type-enforced decision.
 */
export type SdkHook<TFn> = {
  /** Set `false` to disable this hook without removing its config. Default: true. */
  enabled?: boolean;
  /** The hook implementation. */
  fn: TFn;
  /**
   * Required. Receives the thrown/rejected value if `fn` fails. Runs inside
   * `safeTry` too, so an error here is contained as well.
   */
  onError: (error: unknown) => void | Promise<void>;
};

/**
 * Lifecycle hooks registered once at SDK creation. Each hook fires on every
 * matching operation — use them for cross-cutting concerns like logging,
 * audit trails, and payload enrichment. Every hook is wrapped in {@link SdkHook}
 * so merchant code can never crash the payment flow.
 */
export type SdkHooks = {
  beforeCollect?: SdkHook<BeforeCollectHook>;
  afterCollect?: SdkHook<AfterCollectHook>;
  beforePayout?: SdkHook<BeforePayoutHook>;
  afterPayout?: SdkHook<AfterPayoutHook>;
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
  /** Lifecycle hooks for cross-cutting concerns (logging, enrichment, etc.). */
  hooks?: SdkHooks;
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
 * Well-known failure categories. The SDK derives these from the server's
 * tagged error (or from the transport for `network`/`timeout`) so merchants can
 * branch on a stable category instead of parsing messages or HTTP status codes.
 *
 * - `auth` — invalid/missing/revoked/expired key, bad signature, replay, scope.
 * - `validation` — input the server rejected.
 * - `limit` — account/KYC transaction limits exceeded.
 * - `rate_limit` — too many requests.
 * - `account` — merchant account missing or not active.
 * - `provider` — payment provider/engine rejected the operation.
 * - `not_found` — referenced transaction does not exist.
 * - `internal` — unexpected server-side failure.
 * - `network` — request never reached the server (DNS, TLS, connection).
 * - `timeout` — request exceeded the configured timeout.
 */
export type SdkErrorCategory =
  | "auth"
  | "validation"
  | "limit"
  | "rate_limit"
  | "account"
  | "provider"
  | "not_found"
  | "internal"
  | "network"
  | "timeout";

/**
 * Structured error returned by SDK operations. `category` is machine-readable
 * for branching logic; `message` is human-readable for logs and alerts.
 * `retryable` tells the merchant whether the same request may succeed
 * on re-invocation.
 */
export type SdkError = {
  category: SdkErrorCategory;
  message: string;
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
  /**
   * Machine-readable failure category. Present for the `"error"` event when the
   * failure carries one (initiation rejection, polling/stream failure) — lets
   * merchants branch on a stable category instead of parsing the message.
   */
  category?: SdkErrorCategory;
  /**
   * Whether re-invoking the same operation may succeed. Present for the
   * `"error"` event when known.
   */
  retryable?: boolean;
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
   * Auto-generates an idempotency `reference` if omitted. Throws *synchronously*
   * only on invalid input (zero amount, empty phone, bank method without bank
   * details) — programmer errors caught before any network call. A server-side
   * initiation rejection (auth, limit, provider, network, timeout) does **not**
   * throw: the returned instance emits an `"error"` event carrying `category`
   * and `retryable`, and `wait()` resolves `null`.
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
   * payment.on("error", ({ error, category }) => log.error(category, error));
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
   * Auto-generates an idempotency `reference` if omitted. Same error semantics
   * as {@link collectPayment}: throws synchronously on invalid input, but a
   * server-side initiation rejection surfaces as an `"error"` event (with
   * `category`/`retryable`) rather than a throw.
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

  /** Current transaction status, set from the initiation response and updated on each status change. */
  readonly status: TransactionStatus;

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
   * the full {@link Transaction} on success, or `null` on failure,
   * cancellation, or polling error. Never rejects.
   *
   * @example
   * ```ts
   * const tx = await payment.wait();
   * if (tx) {
   *   console.log("Paid:", tx.amount, tx.currency);
   * } else {
   *   console.error("Payment did not succeed");
   * }
   * ```
   */
  wait(): Promise<Transaction | null>;
}
