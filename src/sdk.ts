/**
 * SDK instance providing all merchant-facing payment operations.
 * Created via createNylonPay factory and returned as NylonPaySdk.
 */

import { randomBytes } from "node:crypto";
import { Err, Ok, type Result } from "slang-ts";
import { createPaymentInstance } from "./payment";
import { SDK_ACTIONS } from "./sdk.config";
import { createTransport } from "./transport";
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
  SdkHooks,
  StatusResponse,
  Transaction,
  TransactionStatus,
  VerifyPhoneInput,
  VerifyWebhookInput,
} from "./types";
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

/** Validate that amount is a positive integer. */
function validateAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount must be a positive integer");
  }
}

/** Validate that a string value is non-empty. */
function validateNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
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
    const reference = input.reference ?? generateReference();
    validateAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    validateNonEmpty(input.description, "description");
    if (input.method === "bank" && !input.bank) {
      throw new Error('bank details are required when method is "bank"');
    }

    let payload = { ...input, reference };
    if (config.hooks?.beforeCollect) {
      const mutated = await config.hooks.beforeCollect(payload);
      if (mutated != null)
        payload = { ...mutated, reference: mutated.reference ?? reference };
    }

    const result = await transport.send<{
      reference: string;
      status: TransactionStatus;
    }>({
      action: SDK_ACTIONS.collectPayment,
      payload,
    });

    if (config.hooks?.afterCollect) {
      await config.hooks.afterCollect(
        result.isOk
          ? Ok({
              reference: result.value.reference,
              status: result.value.status,
            })
          : Err(result.error),
        payload,
      );
    }

    if (result.isOk) {
      return createPaymentInstance(result.value, commonDeps);
    }

    return createPaymentInstance(
      { reference, status: "pending" },
      {
        ...commonDeps,
        fetchStatus: async () => Err(result.error),
        fetchTransaction: async () => Err(result.error),
        pollIntervalMs: 0,
        maxPollAttempts: 1,
        maxPollDuration: Number.MAX_SAFE_INTEGER,
      },
    );
  }

  /**
   * Initiate a collection and block until terminal state.
   * Server polls internally; merchant gets the full transaction record.
   */
  async function collectPaymentAndResolve(
    input: CollectPaymentInput,
  ): Promise<Result<Transaction, string>> {
    const reference = input.reference ?? generateReference();
    validateAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    validateNonEmpty(input.description, "description");
    if (input.method === "bank" && !input.bank) {
      throw new Error('bank details are required when method is "bank"');
    }

    let payload = { ...input, reference };
    if (config.hooks?.beforeCollect) {
      const mutated = await config.hooks.beforeCollect(payload);
      if (mutated != null)
        payload = { ...mutated, reference: mutated.reference ?? reference };
    }

    const result = await transport.send<Transaction>({
      action: SDK_ACTIONS.collectPaymentAndResolve,
      payload,
    });

    if (config.hooks?.afterCollect) {
      await config.hooks.afterCollect(
        result.isOk
          ? Ok({
              reference: result.value.reference,
              status: result.value.status,
            })
          : Err(result.error),
        payload,
      );
    }

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
    const reference = input.reference ?? generateReference();
    validateAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    validateNonEmpty(input.description, "description");
    validateNonEmpty(
      input.destination.accountHolderName,
      "destination.accountHolderName",
    );
    validateNonEmpty(
      input.destination.accountNumber,
      "destination.accountNumber",
    );

    let payload = { ...input, reference };
    if (config.hooks?.beforePayout) {
      const mutated = await config.hooks.beforePayout(payload);
      if (mutated != null)
        payload = { ...mutated, reference: mutated.reference ?? reference };
    }

    const result = await transport.send<{
      reference: string;
      status: TransactionStatus;
    }>({
      action: SDK_ACTIONS.makePayout,
      payload,
    });

    if (config.hooks?.afterPayout) {
      await config.hooks.afterPayout(
        result.isOk
          ? Ok({
              reference: result.value.reference,
              status: result.value.status,
            })
          : Err(result.error),
        payload,
      );
    }

    if (result.isOk) {
      return createPaymentInstance(result.value, commonDeps);
    }

    return createPaymentInstance(
      { reference, status: "pending" },
      {
        ...commonDeps,
        fetchStatus: async () => Err(result.error),
        fetchTransaction: async () => Err(result.error),
        pollIntervalMs: 0,
        maxPollAttempts: 1,
        maxPollDuration: Number.MAX_SAFE_INTEGER,
      },
    );
  }

  /**
   * Initiate a payout and block until terminal state.
   * Server polls internally; merchant gets the full transaction record.
   */
  async function makePayoutAndResolve(
    input: MakePayoutInput,
  ): Promise<Result<Transaction, string>> {
    const reference = input.reference ?? generateReference();
    validateAmount(input.amount);
    validateNonEmpty(input.customer.name, "customer.name");
    validateNonEmpty(input.customer.phoneNumber, "customer.phoneNumber");
    validateNonEmpty(input.description, "description");
    validateNonEmpty(
      input.destination.accountHolderName,
      "destination.accountHolderName",
    );
    validateNonEmpty(
      input.destination.accountNumber,
      "destination.accountNumber",
    );

    let payload = { ...input, reference };
    if (config.hooks?.beforePayout) {
      const mutated = await config.hooks.beforePayout(payload);
      if (mutated != null)
        payload = { ...mutated, reference: mutated.reference ?? reference };
    }

    const result = await transport.send<Transaction>({
      action: SDK_ACTIONS.makePayoutAndResolve,
      payload,
    });

    if (config.hooks?.afterPayout) {
      await config.hooks.afterPayout(
        result.isOk
          ? Ok({
              reference: result.value.reference,
              status: result.value.status,
            })
          : Err(result.error),
        payload,
      );
    }

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
      throw new Error("id or reference is required");
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

    const result = await transport.send<PhoneVerification>({
      action: SDK_ACTIONS.verifyPhone,
      payload: input,
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
    const reference = input.reference ?? generateReference();
    validateAmount(input.amount);
    validateNonEmpty(input.description, "description");

    if (input.items) {
      if (input.items.length > 50) {
        throw new Error("items must not exceed 50");
      }
      for (const item of input.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error("item quantity must be a positive integer");
        }
        if (!Number.isInteger(item.unitPrice) || item.unitPrice <= 0) {
          throw new Error("item unitPrice must be a positive integer");
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
