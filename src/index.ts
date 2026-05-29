/**
 * @nylonpay/sdk - Nylon Pay SDK for merchant integrations
 *
 * Server-side SDK for integrating Nylon Pay into merchant applications.
 * Supports TypeScript and JavaScript (ESM + CJS).
 *
 * @see Spec 2 - Collection Transaction Flow
 *
 * @example
 * ```ts
 * import { createNylonPay } from "@nylonpay/sdk";
 *
 * const nylonpay = createNylonPay({
 *   environment: "live",
 *   apiKey: "npk_...",
 *   apiSecret: "nps_...",
 * });
 *
 * const payment = await nylonpay.collectPayment({
 *   amount: 10000,
 *   currency: "UGX",
 *   reference: "ORDER-123",
 *   method: "mobileMoney",
 *   description: "Mobile money payment",
 *   customer: { name: "John", phoneNumber: "+256700000000" },
 * });
 *
 * payment.on("success", (data) => console.log("Paid!", data));
 * ```
 */

// Factory function - main entry point
export { createNylonPay } from "./create-nylon-pay";

// Standalone webhook verification utility
export { verifyWebhookSignature } from "./verify-webhook";

// Error parsing utility
export { parseError } from "./transport";

// SDK instance type
export type { NylonPaySdk } from "./types";

// Payment instance type
export type { PaymentInstance } from "./types";

// Configuration type
export type { NylonPayConfig, SdkEnvironment } from "./types";

// Request/Response types
export type {
  CollectPaymentInput,
  MakePayoutInput,
  GetStatusInput,
  GetTransactionInput,
  VerifyPhoneInput,
  CreateInvoiceInput,
  InvoiceResponse,
  StatusResponse,
  Transaction,
  TransactionStatus,
  TransactionType,
  TransactionMode,
  PaymentMethod,
  Currency,
  Customer,
  Destination,
  BankDetails,
  InvoiceItem,
  PhoneVerification,
} from "./types";

// Event types
export type { PaymentEvent, PaymentEventHandler, EventData } from "./types";

// Webhook types
export type { WebhookEventType, WebhookPayload, VerifyWebhookInput } from "./types";

// Error type
export type { SdkError } from "./types";
