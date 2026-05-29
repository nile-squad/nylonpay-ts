import { Result } from 'slang-ts';

/**
 * SDK environment - sandbox mode transactions don't count toward limits.
 * @see Spec 1 section 3 and Spec 2 section 10
 */
type SdkEnvironment = 'sandbox' | 'live';
/**
 * Configuration for creating a Nylon Pay SDK instance.
 * @example
 * ```ts
 * const sdk = createNylonPay({
 *   environment: "live",
 *   apiKey: "npk_...",
 *   apiSecret: "nps_...",
 * });
 * ```
 */
interface NylonPayConfig {
    /** Sandbox or live environment */
    environment: SdkEnvironment;
    /** API key from dashboard (npk_ prefix) */
    apiKey: string;
    /** API secret from dashboard (nps_ prefix) - required for signing */
    apiSecret: string;
    /** Backend URL (defaults to production) */
    baseUrl?: string;
    /** Request timeout in ms (defaults to 30000) */
    timeoutMs?: number;
    /** Max retry attempts for failed requests (defaults to 3) */
    maxRetries?: number;
    /** Max total polling duration in ms before timing out (defaults to 300000) */
    maxPollDuration?: number;
    /** Max polling attempts before timing out (defaults to 150) */
    maxPollAttempts?: number;
    /** Override fetch implementation (for testing or Node.js fetch polyfill) */
    fetch?: typeof globalThis.fetch;
}
/**
 * Request body for creating a collection transaction.
 * @see Spec 2 section 2
 * @example
 * ```ts
 * const payment = await nylonpay.collectPayment({
 *   amount: 10000,
 *   currency: 'UGX',
 *   reference: 'ORDER-123',
 *   method: 'mobile-money',
 *   description: 'Mobile money payment',
 *   customer: {
 *     phone: '+256700000000',
 *   },
 * });
 * ```
 */
interface CreateCollectionRequest {
    /** Transaction amount (in base currency units, e.g., 10000 = 100 UGX) */
    amount: number;
    /** ISO 4217 currency code (default: "UGX") */
    currency?: string;
    /** Payment method (e.g., "mobile-money") */
    method?: string;
    /** Description of the payment */
    description?: string;
    /** Customer details */
    customer: {
        /** Customer phone number (required) */
        phone: string;
        /** Customer email (optional, used for receipts) */
        email?: string;
    };
    /** Unique reference ID (UUID recommended) for idempotency */
    reference: string;
    /** Invoice number if invoice-based transaction */
    invoiceNumber?: string;
    /** Whether to notify merchant on status change */
    notifyMerchant?: boolean;
    /** Additional metadata to store with transaction */
    metadata?: Record<string, unknown>;
}
/**
 * Response from creating a collection transaction.
 * @see Spec 2 section 8 - returns immediately with processing status
 */
interface CollectionResponse {
    transactionId: string;
    reference: string;
    status: TransactionStatus;
    providerReference?: string;
    createdAt: string;
    _responseSignature?: string;
}
/**
 * Request for polling transaction status.
 * @see Spec 2 section 9
 */
interface GetStatusRequest {
    /** The reference ID used when creating the transaction */
    reference: string;
}
/**
 * Response from status polling.
 * @see Spec 2 section 9
 */
interface StatusResponse {
    transaction: Transaction;
    providerStatus: string;
    webhookDeliveries: WebhookDelivery[];
    _responseSignature?: string;
}
/**
 * Transaction status lifecycle.
 * @see Spec 2 section 8
 */
type TransactionStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled';
/**
 * Transaction record returned from backend.
 */
interface Transaction {
    id: string;
    amount: string;
    currency: string;
    status: TransactionStatus;
    reference: string;
    idempotencyKey?: string;
    type: string;
    tags: string;
    other: TransactionMetadata;
    createdAt: string;
    updatedAt: string;
}
/**
 * Rich metadata stored in transaction.other JSONB field.
 * @see backend/src/services/collections/build-transaction-other.ts
 */
interface TransactionMetadata {
    apiKeyId?: string;
    customer?: {
        phoneNumber?: string;
        email?: string;
    };
    history?: TransactionStatusEntry[];
    invoiceNumber?: string;
    metadata?: Record<string, unknown>;
    mode?: SdkEnvironment;
    notifyMerchant?: boolean;
    providerReference?: string;
}
/**
 * Single entry in transaction status history.
 */
interface TransactionStatusEntry {
    at: string;
    source: string;
    status: TransactionStatus;
}
/**
 * Webhook delivery record.
 */
interface WebhookDelivery {
    id: string;
    event: string;
    payload: string;
    webhookUrl: string;
    status: 'pending' | 'delivered' | 'failed';
    attempts: number;
    responseStatus?: number;
    responseBody?: string;
    createdAt: string;
    updatedAt: string;
}
/**
 * Payment instance returned from collectPayment().
 * Emits events as transaction status changes.
 * @see Spec 2 section 2 - "emits events such as nylonpay.on('success')"
 */
interface PaymentInstance {
    /** The reference ID for this payment */
    readonly reference: string;
    /** Current transaction status */
    readonly status: TransactionStatus | null;
    /**
     * Subscribe to payment events.
     * @param event - Event type to listen for
     * @param handler - Callback function
     */
    on(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;
    /**
     * Subscribe to a payment event for a single invocation, then auto-unsubscribe.
     * Useful for one-shot handlers on terminal events like "success" or "failed".
     * @param event - Event type to listen for
     * @param handler - Callback function (called at most once)
     */
    once(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;
    /**
     * Unsubscribe from payment events.
     * @param event - Event type
     * @param handler - Handler to remove
     */
    off(event: PaymentEvent, handler: PaymentEventHandler): PaymentInstance;
    /**
     * Wait for payment to reach a terminal state.
     * Resolves on success/cancel, rejects on failure/error.
     */
    wait(): Promise<Transaction>;
}
/**
 * Events emitted by a payment instance.
 */
type PaymentEvent = 'processing' | 'success' | 'failed' | 'cancelled' | 'error';
/**
 * Handler for payment events.
 */
type PaymentEventHandler = (data: EventData) => void;
/**
 * Data passed to payment event handlers.
 */
interface EventData {
    event: PaymentEvent;
    transaction?: Transaction;
    error?: string;
    timestamp: string;
}
/**
 * Structured SDK error for transport and auth failures.
 */
interface SdkError {
    code: string;
    message: string;
    statusCode?: number;
    retryable?: boolean;
}

/**
 * SDK instance providing the public API for merchants.
 * Created via createNylonPay factory function.
 *
 * @see Spec 2 section 2 - "this returns an instance of the sdk that they can call methods on such as collectPayment with needed details and fields"
 */

/**
 * SDK instance interface returned from createNylonPay().
 * Provides methods for interacting with Nylon Pay.
 */
interface NylonPaySdk {
    /**
     * Initiate a collection payment.
     * Returns immediately with processing status; use returned instance for events.
     *
     * @param request - Collection request details
     * @returns Payment instance for event subscription and waiting
     *
     * @example
     * ```ts
     * const payment = await nylonpay.collectPayment({
     *   amount: 10000,
     *   currency: 'UGX',
     *   reference: 'ORDER-123',
     *   method: 'mobile-money',
     *   description: 'Mobile money payment',
     *   customer: {
     *     phone: '+256700000000',
     *   },
     * });
     *
     * payment.on("success", (data) => {
     *   console.log("Payment succeeded!", data);
     * });
     * ```
     */
    collectPayment(request: CreateCollectionRequest): Promise<PaymentInstance>;
    /**
     * Get the current status of a transaction.
     * Polls the provider for the latest status.
     *
     * @param request - Status request with reference ID
     * @returns Transaction details and provider status
     */
    getStatus(request: GetStatusRequest): Promise<Result<StatusResponse, string>>;
    /**
     * Create an invoice via SDK auth.
     * @see Spec 2 section 2 - "The merchant through our sdk, may first issue an invoice"
     *
     * @param request - Invoice details
     * @returns Created invoice with payment link
     */
    createInvoice(request: CreateInvoiceRequest): Promise<Result<InvoiceResponse, string>>;
}
/**
 * Request for creating an invoice via SDK.
 */
interface CreateInvoiceRequest {
    amount: number;
    currency?: string;
    customerEmail?: string;
    customerPhone?: string;
    description?: string;
    dueDate?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Response from invoice creation.
 */
interface InvoiceResponse {
    invoiceNumber: string;
    paymentLink: string;
    amount: string;
    currency: string;
    status: string;
    createdAt: string;
}

/**
 * Factory function to create a Nylon Pay SDK instance.
 * This is the main entry point for merchants.
 *
 * @see Spec 2 section 2 - "create the sdk instance passing it mode, api key and api secret and then this returns an instance of the sdk"
 * @see Spec 1 section 5 - "last step we show them what to run on their server, the envs to set, and how to install sdk"
 *
 * @example
 * ```ts
 * // nylonpay.config.ts (recommended project root placement)
 * import { createNylonPay } from "@nylonpay/sdk";
 *
 * export const nylonpay = createNylonPay({
 *   environment: "live",
 *   apiKey: process.env.nylonpay_API_KEY!,
 *   apiSecret: process.env.nylonpay_API_SECRET!,
 * });
 *
 * // Export for use in other parts of the project
 * export default nylonpay;
 *
 * // Usage in route handlers:
 * import { nylonpay } from "./nylonpay.config";
 *
 * app.post("/pay", async (req, res) => {
 *   const payment = nylonpay.collectPayment({
 *     amount: 5000,
 *     method: "mobile-money",
 *     description: "Order payment",
 *     customer: { phone: req.body.phone },
 *     reference: `order-${Date.now()}`,
 *   });
 *
 *   payment.on("success", (data) => {
 *     // Fulfill order
 *   });
 *
 *   res.json({ status: "processing" });
 * });
 * ```
 */

/**
 * Create a Nylon Pay SDK instance.
 *
 * @param config - SDK configuration with apiKey, apiSecret, environment
 * @returns SDK instance with collectPayment, getStatus, createInvoice methods
 *
 * @throws Error if required config is missing
 */
declare function createNylonPay(config: NylonPayConfig): NylonPaySdk;

/**
 * HTTP transport layer for SDK communication with backend.
 * Handles auth headers, retries, timeouts, and error mapping.
 *
 * @see Spec 2 section 1 - "sends a request to our backend with all these other values such as the nonce in the headers"
 */

/**
 * Parse an error string into an SdkError object.
 * Useful for handling errors from the SDK.
 *
 * @example
 * ```ts
 * const result = await sdk.collectPayment(request);
 * if (!result.isOk) {
 *   const sdkError = parseError(result.error);
 *   console.log(sdkError.code, sdkError.message);
 * }
 * ```
 */
declare function parseError(error: string): SdkError;

export { type CollectionResponse, type CreateCollectionRequest, type CreateInvoiceRequest, type EventData, type GetStatusRequest, type InvoiceResponse, type NylonPayConfig, type NylonPaySdk, type PaymentEvent, type PaymentEventHandler, type PaymentInstance, type SdkEnvironment, type SdkError, type StatusResponse, type Transaction, type TransactionMetadata, type TransactionStatus, type TransactionStatusEntry, type WebhookDelivery, createNylonPay, parseError };
