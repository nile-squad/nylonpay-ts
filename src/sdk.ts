/**
 * SDK instance providing all merchant-facing payment operations.
 * Created via createNylonPay factory and returned as NylonPaySdk.
 */

import { randomBytes } from "node:crypto";
import { Err, Ok, type Result, safeTry } from "slang-ts";
import { createPaymentInstance } from "./payment";
import { SDK_ACTIONS } from "./sdk.config";
import { createSdkError, createTransport, parseError } from "./transport";
import type {
  CollectPaymentInput,
  CreateInvoiceInput,
  GetStatusInput,
  GetTransactionInput,
  InvoiceResponse,
  MakePayoutInput,
  NylonPaySdk,
  PaymentInstance,
  PhoneVerification,
  SdkHook,
  SdkHooks,
  StatusResponse,
  Transaction,
  TransactionStatus,
  VerifyPhoneInput,
  VerifyWebhookInput,
} from "./types";
import { normalizePhone } from "./phone";
import { verifyWebhookSignature } from "./verify-webhook";

export type { NylonPaySdk } from "./types";

type ResolvedConfig = {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxPollIntervalMs: number;
  maxPollDurationMs: number;
  maxPollAttempts: number;
  fetch: typeof globalThis.fetch;
  hooks?: SdkHooks;
};

/** Generate a random 15-character hex reference for idempotency. */
function generateReference(): string {
  return randomBytes(16).toString("hex").slice(0, 15);
}

/**
 * PivotPay caps the `merchantTransactionId` (our reference) at 13–15 characters.
 * The backend echoes the reference verbatim as that id, so an out-of-range
 * reference is rejected server-side (and historically surfaced as an opaque
 * provider error). Auto-generated references are always 15 chars; this only
 * bites when a merchant supplies their own (e.g. a 36-char UUID order id).
 */
const REFERENCE_MIN_LENGTH = 13;
const REFERENCE_MAX_LENGTH = 15;

/**
 * Resolve the idempotency reference for a create call: auto-generate when the
 * merchant omits it, otherwise validate their value against the 13–15 char
 * limit *synchronously* (like validateAmount) so a bad reference throws locally
 * instead of costing a backend round-trip.
 */
function resolveReference(reference?: string): string {
  if (reference === undefined) {
    return generateReference();
  }
  if (
    reference.length < REFERENCE_MIN_LENGTH ||
    reference.length > REFERENCE_MAX_LENGTH
  ) {
    throwValidation(
      `reference must be ${REFERENCE_MIN_LENGTH}–${REFERENCE_MAX_LENGTH} characters`,
    );
  }
  return reference;
}

/**
 * Run a lifecycle hook safely. A disabled or unset hook is a no-op. The hook's
 * `fn` runs inside `safeTry` so a throw/rejection in merchant code never bubbles
 * into the payment flow — it is routed to the hook's `onError` (which is itself
 * wrapped, so a faulty handler can't crash us either).
 *
 * Returns the hook's resolved value on success, or `undefined` when the hook was
 * skipped or failed. Callers treat `undefined` as "no override" — for before
 * hooks that means the original payload is used unchanged.
 */
async function runHook<TFn extends (...args: never[]) => unknown>(
  hook: SdkHook<TFn> | undefined,
  ...args: Parameters<TFn>
): Promise<Awaited<ReturnType<TFn>> | undefined> {
  if (!hook || hook.enabled === false) return undefined;

  const result = await safeTry(async () => hook.fn(...args));
  // safeTry widens the success value to `unknown` through the generic bound;
  // by construction it is the hook's resolved return type.
  if (result.isOk) return result.value as Awaited<ReturnType<TFn>>;

  await safeTry(async () => hook.onError(result.error));
  return undefined;
}

/**
 * Throw a categorized input-validation error. Keeps thrown errors consistent
 * with transport-init failures so a merchant's `catch (e)` can always read
 * `e.category` (here always `"validation"`).
 */
function throwValidation(message: string): never {
  throw createSdkError({ category: "validation", message });
}

/** Validate collection amount is a positive integer >= 500. */
function validateCollectionAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throwValidation("amount must be a positive integer");
  }
  if (amount < 500) {
    throwValidation("Collection amount must be at least 500 UGX");
  }
}

/** Validate payout amount is a positive integer >= 5000. */
function validatePayoutAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throwValidation("amount must be a positive integer");
  }
  if (amount < 5000) {
    throwValidation("Payout amount must be at least 5000 UGX");
  }
}

/** Validate that a string value is non-empty. */
function validateNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim() === "") {
    throwValidation(`${fieldName} is required`);
  }
}

/**
 * Create an SDK instance with resolved configuration.
 * Returns an object implementing the NylonPaySdk interface.
 */
export function createSdkInstance(config: ResolvedConfig): NylonPaySdk {
  const transport = createTransport({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    fetch: config.fetch,
  });

  const commonDeps = {
    fetchStatus: (input: GetStatusInput) =>
      transport.send<StatusResponse>({
        action: SDK_ACTIONS.getStatus,
        payload: input,
      }),
    fetchTransaction: (input: GetTransactionInput) =>
      transport.send<Transaction>({
        action: SDK_ACTIONS.getTransaction,
        payload: input,
      }),
    pollIntervalMs: config.maxPollIntervalMs,
    maxPollDuration: config.maxPollDurationMs,
    maxPollAttempts: config.maxPollAttempts,
  };

  /**
   * Initiate a collection payment.
   * Auto-generates reference if omitted. Returns a PaymentInstance
   * that emits events as the transaction progresses.
   */
  async function collectPayment(
    input: CollectPaymentInput,
  ): Promise<PaymentInstance> {
    const reference = resolveReference(input.reference);
    validateCollectionAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    const normalizedPhone = normalizePhone(input.customer.phoneNumber);
    validateNonEmpty(input.description, "description");
    if (input.method === "bank" && !input.bank) {
      throwValidation('bank details are required when method is "bank"');
    }

    let payload = { ...input, reference, customer: { ...input.customer, phoneNumber: normalizedPhone } };
    const mutated = await runHook(config.hooks?.beforeCollect, payload);
    if (mutated != null)
      payload = { ...mutated, reference: mutated.reference ?? reference };

    const result = await transport.send<{
      reference: string;
      status: TransactionStatus;
    }>({
      action: SDK_ACTIONS.collectPayment,
      payload,
    });

    await runHook(
      config.hooks?.afterCollect,
      result.isOk
        ? Ok({ reference: result.value.reference, status: result.value.status })
        : Err(result.error),
      payload,
    );

    // Initiation failed (invalid key, signature, limit, provider reject). The
    // transaction never started — return a PaymentInstance that emits an
    // "error" event instead of throwing, so merchants handle it via events.
    if (result.isErr) {
      const sdkErr = parseError(result.error);
      return createPaymentInstance(
        { reference, status: "pending" },
        { ...commonDeps, initialError: sdkErr },
      );
    }

    return createPaymentInstance(result.value, commonDeps);
  }

  /**
   * Initiate a collection and block until terminal state.
   * Server polls internally; merchant gets the full transaction record.
   */
  async function collectPaymentAndResolve(
    input: CollectPaymentInput,
  ): Promise<Result<Transaction, string>> {
    const reference = resolveReference(input.reference);
    validateCollectionAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    const normalizedPhone = normalizePhone(input.customer.phoneNumber);
    validateNonEmpty(input.description, "description");
    if (input.method === "bank" && !input.bank) {
      throwValidation('bank details are required when method is "bank"');
    }

    let payload = { ...input, reference, customer: { ...input.customer, phoneNumber: normalizedPhone } };
    const mutated = await runHook(config.hooks?.beforeCollect, payload);
    if (mutated != null)
      payload = { ...mutated, reference: mutated.reference ?? reference };

    const result = await transport.send<Transaction>({
      action: SDK_ACTIONS.collectPaymentAndResolve,
      payload,
    });

    await runHook(
      config.hooks?.afterCollect,
      result.isOk
        ? Ok({ reference: result.value.reference, status: result.value.status })
        : Err(result.error),
      payload,
    );

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Initiate a payout.
   * Auto-generates reference if omitted. Returns a PaymentInstance
   * that emits events as the transaction progresses.
   */
  async function makePayout(input: MakePayoutInput): Promise<PaymentInstance> {
    const reference = resolveReference(input.reference);
    validatePayoutAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    const normalizedPhone = normalizePhone(input.customer.phoneNumber);
    validateNonEmpty(input.description, "description");
    validateNonEmpty(
      input.destination.accountHolderName,
      "destination.accountHolderName",
    );
    validateNonEmpty(
      input.destination.accountNumber,
      "destination.accountNumber",
    );

    let payload = { ...input, reference, customer: { ...input.customer, phoneNumber: normalizedPhone } };
    const mutated = await runHook(config.hooks?.beforePayout, payload);
    if (mutated != null)
      payload = { ...mutated, reference: mutated.reference ?? reference };

    const result = await transport.send<{
      reference: string;
      status: TransactionStatus;
    }>({
      action: SDK_ACTIONS.makePayout,
      payload,
    });

    await runHook(
      config.hooks?.afterPayout,
      result.isOk
        ? Ok({ reference: result.value.reference, status: result.value.status })
        : Err(result.error),
      payload,
    );

    // Initiation failed — return a PaymentInstance that emits an "error"
    // event instead of throwing (see collectPayment for rationale).
    if (result.isErr) {
      const sdkErr = parseError(result.error);
      return createPaymentInstance(
        { reference, status: "pending" },
        { ...commonDeps, initialError: sdkErr },
      );
    }

    return createPaymentInstance(result.value, commonDeps);
  }

  /**
   * Initiate a payout and block until terminal state.
   * Server polls internally; merchant gets the full transaction record.
   */
  async function makePayoutAndResolve(
    input: MakePayoutInput,
  ): Promise<Result<Transaction, string>> {
    const reference = resolveReference(input.reference);
    validatePayoutAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    const normalizedPhone = normalizePhone(input.customer.phoneNumber);
    validateNonEmpty(input.description, "description");
    validateNonEmpty(
      input.destination.accountHolderName,
      "destination.accountHolderName",
    );
    validateNonEmpty(
      input.destination.accountNumber,
      "destination.accountNumber",
    );

    let payload = { ...input, reference, customer: { ...input.customer, phoneNumber: normalizedPhone } };
    const mutated = await runHook(config.hooks?.beforePayout, payload);
    if (mutated != null)
      payload = { ...mutated, reference: mutated.reference ?? reference };

    const result = await transport.send<Transaction>({
      action: SDK_ACTIONS.makePayoutAndResolve,
      payload,
    });

    await runHook(
      config.hooks?.afterPayout,
      result.isOk
        ? Ok({ reference: result.value.reference, status: result.value.status })
        : Err(result.error),
      payload,
    );

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Get the current status of a transaction.
   * Lightweight check that returns only status fields.
   */
  async function getStatus(
    input: GetStatusInput,
  ): Promise<Result<StatusResponse, string>> {
    validateNonEmpty(input.reference, "reference");

    const result = await transport.send<StatusResponse>({
      action: SDK_ACTIONS.getStatus,
      payload: input,
    });

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Get the full transaction record.
   * Requires at least one of id or reference.
   */
  async function getTransaction(
    input: GetTransactionInput,
  ): Promise<Result<Transaction, string>> {
    if (!input.id && !input.reference) {
      throwValidation("id or reference is required");
    }

    const result = await transport.send<Transaction>({
      action: SDK_ACTIONS.getTransaction,
      payload: input,
    });

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Verify a phone number with the provider.
   * Returns the registered name for identity confirmation.
   */
  async function verifyPhone(
    input: VerifyPhoneInput,
  ): Promise<Result<PhoneVerification, string>> {
    validateNonEmpty(input.phoneNumber, "phoneNumber");
    const normalizedPhone = normalizePhone(input.phoneNumber);

    const result = await transport.send<PhoneVerification>({
      action: SDK_ACTIONS.verifyPhone,
      payload: { ...input, phoneNumber: normalizedPhone },
    });

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Create a hosted invoice.
   * Auto-generates reference if omitted. Returns payment link and token.
   */
  async function createInvoice(
    input: CreateInvoiceInput,
  ): Promise<Result<InvoiceResponse, string>> {
    const reference = resolveReference(input.reference);
    validateCollectionAmount(input.amount);
    validateNonEmpty(input.description, "description");

    if (input.items) {
      if (input.items.length > 50) {
        throwValidation("items must not exceed 50");
      }
      for (const item of input.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throwValidation("item quantity must be a positive integer");
        }
        if (!Number.isInteger(item.unitPrice) || item.unitPrice <= 0) {
          throwValidation("item unitPrice must be a positive integer");
        }
      }
    }

    const payload = { ...input, reference };
    const result = await transport.send<InvoiceResponse>({
      action: SDK_ACTIONS.createInvoice,
      payload,
    });

    if (result.isOk) {
      return Ok(result.value);
    }
    return Err(result.error);
  }

  /**
   * Verify a webhook payload signature.
   * Delegates to the standalone verifyWebhookSignature utility.
   */
  function verifyWebhook(input: VerifyWebhookInput): boolean {
    return verifyWebhookSignature(input);
  }

  return {
    collectPayment,
    collectPaymentAndResolve,
    makePayout,
    makePayoutAndResolve,
    getStatus,
    getTransaction,
    verifyPhone,
    createInvoice,
    verifyWebhookSignature: verifyWebhook,
  };
}
