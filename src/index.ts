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
export {
  UNREACHABLE_CODE,
  UNREACHABLE_HOST_OFFLINE,
  UNREACHABLE_NYLON_DOWN,
} from "./sdk.config";
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
  AfterHookInput,
  AfterPayoutHook,
  BankDetails,
  BeforeCollectHook,
  BeforePayoutHook,
  BuyAirtimeInput,
  CollectPaymentInput,
  CreateInvoiceInput,
  Currency,
  Customer,
  Destination,
  EventData,
  FailureCategory,
  FailureCode,
  GetStatusInput,
  GetTransactionInput,
  InvoiceItem,
  InvoiceResponse,
  MakePayoutInput,
  NylonPayConfig,
  NylonPaySdk,
  PayBillInput,
  PaymentEvent,
  PaymentEventHandler,
  PaymentInstance,
  PaymentMethod,
  PhoneVerification,
  SandboxTestOutcome,
  SdkError,
  SdkErrorCategory,
  SdkErrorHandler,
  SdkHooks,
  StatusResponse,
  Transaction,
  TransactionMode,
  TransactionStatus,
  TransactionType,
  UnreachableReason,
  UtilityPaymentResponse,
  VerifyPhoneInput,
  VerifyWebhookInput,
  WebhookEventType,
  WebhookPayload,
  WebhookTransactionSnapshot,
} from "./types";
export { FAILURE_CODES, SANDBOX_TEST_OUTCOMES } from "./types";
// Standalone webhook verification utility
export {
  DISABLE_FRESHNESS_CHECK,
  verifyWebhookSignature,
} from "./verify-webhook";
