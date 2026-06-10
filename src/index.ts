/**
 * @nile-squad/nylonpay-ts - Nylon Pay SDK for merchant integrations
 *
 * Server-side SDK for integrating Nylon Pay into merchant applications.
 * Supports TypeScript and JavaScript (ESM + CJS).
 *
 * @see Spec 2 - Collection Transaction Flow
 *
 * @example
 * ```ts
 * import { createNylonPay } from "@nile-squad/nylonpay-ts";
 *
 * const nylonpay = createNylonPay({
 *   apiKey: "npk_...",
 *   apiSecret: "nps_...",
 * });
 *
 * const payment = await nylonpay.collectPayment({
 *   amount: 10000,
 *   currency: "UGX",
 *   reference: "ORDER-2026-001",
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
// Error utilities
export { createSdkError, parseError } from "./transport";
// SDK instance type
// Payment instance type
// Configuration type
// Request/Response types
// Event types
// Webhook types
// Error type
export type {
  AfterCollectHook,
  AfterPayoutHook,
  BankDetails,
  BeforeCollectHook,
  BeforePayoutHook,
  CollectPaymentInput,
  CreateInvoiceInput,
  Currency,
  Customer,
  Destination,
  EventData,
  GetStatusInput,
  GetTransactionInput,
  InvoiceItem,
  InvoiceResponse,
  MakePayoutInput,
  NylonPayConfig,
  NylonPaySdk,
  PaymentEvent,
  PaymentEventHandler,
  PaymentInstance,
  PaymentMethod,
  PhoneVerification,
  SdkError,
  SdkErrorCategory,
  SdkHooks,
  StatusResponse,
  Transaction,
  TransactionMode,
  TransactionStatus,
  TransactionType,
  VerifyPhoneInput,
  VerifyWebhookInput,
  WebhookEventType,
  WebhookPayload,
} from "./types";
// Standalone webhook verification utility
export { verifyWebhookSignature } from "./verify-webhook";
