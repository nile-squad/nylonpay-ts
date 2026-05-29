'use strict';

var slangTs = require('slang-ts');
var os = require('os');
var crypto = require('crypto');

// src/sdk.ts

// src/pubsub.ts
function createEmitter() {
  const state = {
    listeners: /* @__PURE__ */ new Map()
  };
  function on(event, handler) {
    if (!state.listeners.has(event)) {
      state.listeners.set(event, /* @__PURE__ */ new Set());
    }
    state.listeners.get(event).add(handler);
    return () => off(event, handler);
  }
  function once(event, handler) {
    const wrapper = (data) => {
      off(event, wrapper);
      handler(data);
    };
    on(event, wrapper);
    return emitter;
  }
  function off(event, handler) {
    const handlers = state.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  function emit(event, data) {
    const handlers = state.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch {
      }
    }
  }
  function clear(event) {
    if (event) {
      state.listeners.delete(event);
    } else {
      state.listeners.clear();
    }
  }
  function listenerCount(event) {
    return state.listeners.get(event)?.size ?? 0;
  }
  const emitter = { on, once, off, emit, clear, listenerCount };
  return emitter;
}

// src/payment.ts
var STATUS_TO_EVENT = {
  successful: "success",
  failed: "failed",
  processing: "processing",
  cancelled: "cancelled"
};
function statusToEvent(status) {
  return STATUS_TO_EVENT[status] ?? null;
}
var TERMINAL_STATES = /* @__PURE__ */ new Set([
  "successful",
  "failed",
  "cancelled"
]);
function createPaymentInstance(initialResponse, deps) {
  const state = {
    reference: initialResponse.reference,
    status: initialResponse.status,
    transaction: null,
    pollingTimer: null,
    resolved: false,
    pollAttempts: 0,
    pollStartTime: Date.now(),
    emitter: createEmitter(),
    fetchStatus: deps.fetchStatus,
    pollIntervalMs: deps.pollIntervalMs ?? 2e3,
    maxPollDuration: deps.maxPollDuration ?? 3e5,
    maxPollAttempts: deps.maxPollAttempts ?? 150
  };
  function resolveWithError(error) {
    state.resolved = true;
    stopPolling();
    emitEvent("error", error);
  }
  function emitEvent(event, error) {
    const data = {
      event,
      transaction: state.transaction ?? void 0,
      error,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    state.emitter.emit(event, data);
  }
  function handleStatusUpdate(response) {
    const { transaction } = response;
    if (transaction.reference !== state.reference) {
      resolveWithError(
        `Reference mismatch: expected ${state.reference} but got ${transaction.reference}`
      );
      return;
    }
    const newStatus = transaction.status;
    const oldStatus = state.status;
    state.transaction = transaction;
    state.status = newStatus;
    if (newStatus !== oldStatus) {
      const event = statusToEvent(newStatus);
      if (event) {
        emitEvent(event);
      }
    }
    if (TERMINAL_STATES.has(newStatus)) {
      stopPolling();
      state.resolved = true;
    }
  }
  function handlePollError(error) {
    if (!error.includes("not found") && !error.includes("NOT_FOUND")) {
      emitEvent("error", error);
    }
  }
  function scheduleNextPoll() {
    if (state.resolved || state.pollingTimer) {
      return;
    }
    state.pollingTimer = setTimeout(() => {
      state.pollingTimer = null;
      void pollStatus();
    }, state.pollIntervalMs);
  }
  async function pollStatus() {
    if (state.resolved) {
      stopPolling();
      return;
    }
    if (state.pollAttempts >= state.maxPollAttempts) {
      resolveWithError("Polling timeout: exceeded maximum attempts");
      return;
    }
    if (Date.now() - state.pollStartTime >= state.maxPollDuration) {
      resolveWithError("Polling timeout: exceeded maximum duration");
      return;
    }
    state.pollAttempts += 1;
    const result = await state.fetchStatus({ reference: state.reference });
    if (!result) {
      handlePollError("Invalid status response");
      scheduleNextPoll();
      return;
    }
    if (result.isOk) {
      handleStatusUpdate(result.value);
    } else {
      handlePollError(
        typeof result.error === "string" ? result.error : JSON.stringify(result.error)
      );
    }
    if (state.resolved) {
      stopPolling();
      return;
    }
    scheduleNextPoll();
  }
  function startPolling() {
    scheduleNextPoll();
  }
  function stopPolling() {
    if (state.pollingTimer) {
      clearTimeout(state.pollingTimer);
      state.pollingTimer = null;
    }
  }
  function on(event, handler) {
    state.emitter.on(event, handler);
    return paymentInstance;
  }
  function off(event, handler) {
    state.emitter.off(event, handler);
    return paymentInstance;
  }
  function once(event, handler) {
    state.emitter.once(event, handler);
    return paymentInstance;
  }
  function wait() {
    return new Promise((resolve, reject) => {
      if (state.resolved && state.transaction) {
        if (state.status === "successful") {
          resolve(state.transaction);
        } else {
          reject(new Error(`Payment ${state.status}`));
        }
        return;
      }
      function onSuccess(data) {
        cleanup();
        if (state.transaction) resolve(state.transaction);
      }
      function onFailed(data) {
        cleanup();
        reject(new Error("Payment failed"));
      }
      function onCancelled(data) {
        cleanup();
        reject(new Error("Payment cancelled"));
      }
      function onError(data) {
        cleanup();
        const eventData = data;
        reject(new Error(eventData.error ?? "Payment error"));
      }
      function cleanup() {
        state.emitter.off("success", onSuccess);
        state.emitter.off("failed", onFailed);
        state.emitter.off("cancelled", onCancelled);
        state.emitter.off("error", onError);
      }
      state.emitter.on("success", onSuccess);
      state.emitter.on("failed", onFailed);
      state.emitter.on("cancelled", onCancelled);
      state.emitter.on("error", onError);
    });
  }
  const paymentInstance = {
    get reference() {
      return state.reference;
    },
    get status() {
      return state.status;
    },
    on,
    once,
    off,
    wait
  };
  startPolling();
  return paymentInstance;
}
function generateFingerprint() {
  const components = [
    `type:${os.type()}`,
    `platform:${os.platform()}`,
    `arch:${os.arch()}`,
    `release:${os.release()}`,
    `hostname:${os.hostname()}`,
    `node:${process.versions.node}`,
    `v8:${process.versions.v8}`
  ].join("|");
  return crypto.createHash("sha256").update(components).digest("hex");
}
function generateNonce(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}
function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value).sort(
      ([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)
    );
    return Object.fromEntries(
      sortedEntries.map(([entryKey, entryValue]) => [
        entryKey,
        sortValue(entryValue)
      ])
    );
  }
  return value;
}
function createCanonicalPayload(payload) {
  return JSON.stringify(sortValue(payload));
}
function createSignaturePayload(input) {
  return `${input.fingerprint}.${input.nonce}.${input.timestamp}.${createCanonicalPayload(input.payload)}`;
}
function createSignature(input) {
  const payload = createSignaturePayload(input);
  return crypto.createHmac("sha256", input.secret).update(payload).digest("hex");
}
function createTimestamp() {
  return Date.now().toString();
}
function verifyResponseSignature(data, signature, secret) {
  const expectedSignature = crypto.createHmac("sha256", secret).update(createCanonicalPayload(data)).digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

// src/transport.ts
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
var CACHED_FINGERPRINT = generateFingerprint();
function serializeError(error) {
  return JSON.stringify(error);
}
function deserializeError(error) {
  try {
    return JSON.parse(error);
  } catch {
    return { code: "UNKNOWN", message: error };
  }
}
function calculateBackoff(attempt) {
  const base = 2 ** attempt * 1e3;
  const jitter = Math.random() * 500;
  return base + jitter;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function stripResponseSignature(payload) {
  if (!payload || typeof payload !== "object" || !("_responseSignature" in payload)) {
    return {
      data: payload,
      responseSignature: null
    };
  }
  const { _responseSignature, ...rest } = payload;
  return {
    data: rest,
    responseSignature: typeof _responseSignature === "string" ? _responseSignature : null
  };
}
function createTransport(config) {
  const {
    apiKey,
    apiSecret,
    baseUrl,
    timeoutMs,
    maxRetries,
    fetch: fetchImpl
  } = config;
  function buildAuthHeaders(payload) {
    const nonce = generateNonce();
    const timestamp = createTimestamp();
    const signature = createSignature({
      fingerprint: CACHED_FINGERPRINT,
      nonce,
      timestamp,
      payload,
      secret: apiSecret
    });
    return {
      "x-nylon-key": apiKey,
      "x-nylon-nonce": nonce,
      "x-nylon-signature": signature,
      "x-nylon-timestamp": timestamp
    };
  }
  function buildRequestBody(payload) {
    return {
      ...payload,
      _fingerprint: CACHED_FINGERPRINT
    };
  }
  function withTimeout(signal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), {
          once: true
        });
      }
    }
    return {
      controller,
      cleanup: () => clearTimeout(timeoutId)
    };
  }
  async function executeWithRetry(request, attempt = 0) {
    const { controller, cleanup } = withTimeout(request.signal);
    try {
      const headers = {
        "content-type": "application/json"
      };
      let body = request.body;
      if (request.requiresAuth) {
        body = buildRequestBody(request.body);
        Object.assign(headers, buildAuthHeaders(body));
      }
      const url = `${baseUrl}/${request.action}`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      cleanup();
      if (!response.ok) {
        const statusCode = response.status;
        const retryable = RETRYABLE_STATUS_CODES.has(statusCode);
        let errorMessage = `HTTP ${statusCode}`;
        try {
          const errorBody = await response.json();
          if (errorBody && typeof errorBody === "object" && "message" in errorBody) {
            errorMessage = String(errorBody.message);
          }
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        if (retryable && attempt < maxRetries) {
          await delay(calculateBackoff(attempt));
          return executeWithRetry(request, attempt + 1);
        }
        const sdkError = {
          code: `HTTP_${statusCode}`,
          message: errorMessage,
          statusCode,
          retryable
        };
        return slangTs.Err(serializeError(sdkError));
      }
      const payload = await response.json();
      const { data, responseSignature } = stripResponseSignature(payload);
      if (!request.requiresAuth || !responseSignature) {
        return slangTs.Ok(data);
      }
      const isValidResponse = verifyResponseSignature(
        data,
        responseSignature,
        apiSecret
      );
      if (!isValidResponse) {
        return slangTs.Err(
          serializeError({
            code: "RESPONSE_TAMPERED",
            message: "Authenticated response signature verification failed",
            retryable: false
          })
        );
      }
      return slangTs.Ok(data);
    } catch (error) {
      cleanup();
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const sdkError = {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort ? `Request timed out after ${timeoutMs}ms` : String(error),
        retryable: true
      };
      if (attempt < maxRetries) {
        await delay(calculateBackoff(attempt));
        return executeWithRetry(request, attempt + 1);
      }
      return slangTs.Err(serializeError(sdkError));
    }
  }
  async function send(request) {
    return executeWithRetry(request);
  }
  return { send, parseError };
}
function parseError(error) {
  return deserializeError(error);
}

// src/sdk.ts
var UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createSdkInstance(config) {
  const transport = createTransport(config);
  async function collectPayment(request) {
    if (!UUID_V4_REGEX.test(request.reference)) {
      return createPaymentInstance(
        {
          reference: request.reference,
          status: "failed",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          fetchStatus: async () => slangTs.Err("Reference must be a valid UUID v4"),
          pollIntervalMs: 0,
          maxPollAttempts: config.maxPollAttempts,
          maxPollDuration: config.maxPollDuration
        }
      );
    }
    const body = {
      amount: request.amount,
      currency: request.currency ?? "UGX",
      customer: {
        phoneNumber: request.customer.phone,
        email: request.customer.email
      },
      reference: request.reference,
      invoiceNumber: request.invoiceNumber,
      notifyMerchant: request.notifyMerchant ?? true,
      metadata: {
        ...request.metadata,
        method: request.method,
        description: request.description
      }
    };
    const result = await transport.send({
      action: "collections/create-collection",
      body,
      requiresAuth: true
    });
    if (!result.isOk) {
      const errorMessage = result.error;
      const payment = createPaymentInstance(
        {
          reference: request.reference,
          status: "failed",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          fetchStatus: async () => slangTs.Err(errorMessage),
          pollIntervalMs: 0,
          maxPollAttempts: config.maxPollAttempts,
          maxPollDuration: config.maxPollDuration
        }
      );
      return payment;
    }
    return createPaymentInstance(result.value, {
      fetchStatus: async (getStatusReq) => {
        const statusResult = await transport.send({
          action: "collections/get-collection-status",
          body: getStatusReq,
          requiresAuth: true
        });
        if (statusResult.isOk) {
          return slangTs.Ok(statusResult.value);
        }
        return slangTs.Err(statusResult.error);
      },
      maxPollAttempts: config.maxPollAttempts,
      maxPollDuration: config.maxPollDuration
    });
  }
  async function getStatus(request) {
    const result = await transport.send({
      action: "collections/get-collection-status",
      body: request,
      requiresAuth: true
    });
    if (result.isOk) {
      return slangTs.Ok(result.value);
    }
    return slangTs.Err(result.error);
  }
  async function createInvoice(request) {
    const body = {
      amount: request.amount,
      currency: request.currency ?? "UGX",
      customerEmail: request.customerEmail,
      customerPhone: request.customerPhone,
      description: request.description,
      dueDate: request.dueDate,
      metadata: request.metadata
    };
    const result = await transport.send({
      action: "invoices/create-invoice",
      body,
      requiresAuth: true
    });
    if (result.isOk) {
      return slangTs.Ok(result.value);
    }
    return slangTs.Err(result.error);
  }
  return {
    collectPayment,
    getStatus,
    createInvoice
  };
}

// src/create-nylon-pay.ts
var DEFAULT_BASE_URL = "https://api.nylonpay.io/api/services";
var DEFAULT_TIMEOUT_MS = 3e4;
var DEFAULT_MAX_RETRIES = 3;
var DEFAULT_MAX_POLL_DURATION = 3e5;
var DEFAULT_MAX_POLL_ATTEMPTS = 150;
function createNylonPay(config) {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }
  if (!config.apiSecret) {
    throw new Error("apiSecret is required");
  }
  if (!config.environment || config.environment !== "sandbox" && config.environment !== "live") {
    throw new Error('environment must be "sandbox" or "live"');
  }
  const resolvedConfig = {
    environment: config.environment,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    maxPollDuration: config.maxPollDuration ?? DEFAULT_MAX_POLL_DURATION,
    maxPollAttempts: config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis)
  };
  return createSdkInstance(resolvedConfig);
}

exports.createNylonPay = createNylonPay;
exports.parseError = parseError;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map