import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanonicalPayload } from "./signature";
import { createTransport, parseError } from "./transport";

function signResponse(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(createCanonicalPayload(payload))
    .digest("hex");
}

const mockFetch = vi.fn();

describe("createTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTestTransport = () =>
    createTransport({
      apiKey: "npk_test",
      apiSecret: "nps_test",
      baseUrl: "https://test.api",
      timeoutMs: 5000,
      maxRetries: 3,
      fetch: mockFetch,
    });

  describe("envelope format", () => {
    it("sends request with correct envelope structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: { _responseSignature: signResponse({}, "nps_test") },
          }),
      });

      const transport = createTestTransport();
      await transport.send({
        action: "sdk-collect-payment",
        payload: { amount: 1000 },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);

      expect(body).toEqual({
        intent: "execute",
        service: "sdk",
        action: "sdk-collect-payment",
        payload: expect.objectContaining({ amount: 1000 }),
      });
    });

    it("injects _fingerprint into payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: { _responseSignature: signResponse({}, "nps_test") },
          }),
      });

      const transport = createTestTransport();
      await transport.send({
        action: "sdk-collect-payment",
        payload: { amount: 1000 },
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string);

      expect(body.payload._fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("includes auth headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: { _responseSignature: signResponse({}, "nps_test") },
          }),
      });

      const transport = createTestTransport();
      await transport.send({ action: "sdk-collect-payment", payload: {} });

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers as Record<string, string>;

      expect(headers["x-nylon-key"]).toBe("npk_test");
      expect(headers["x-nylon-nonce"]).toMatch(/^[a-f0-9]{32}$/);
      expect(headers["x-nylon-timestamp"]).toMatch(/^\d+$/);
      expect(headers["x-nylon-signature"]).toMatch(/^[a-f0-9]{64}$/);
      expect(headers["content-type"]).toBe("application/json");
    });
  });

  describe("response parsing", () => {
    it("returns Ok(data) when status is true and strips _responseSignature", async () => {
      const data = { reference: "ref-123", status: "pending" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: {
              ...data,
              _responseSignature: signResponse(data, "nps_test"),
            },
          }),
      });

      const transport = createTestTransport();
      const result = await transport.send({
        action: "sdk-collect-payment",
        payload: {},
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(data);
        expect(
          "_responseSignature" in (result.value as Record<string, unknown>),
        ).toBe(false);
      }
    });

    it("derives the category from a tagged HTTP 400 error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () =>
          Promise.resolve({
            status: false,
            message: "[log_1] API key was not found -- error-type: auth",
            data: {},
          }),
      });

      const transport = createTestTransport();
      const result = await transport.send({
        action: "sdk-collect-payment",
        payload: {},
      });

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        const error = parseError(result.error);
        expect(error.category).toBe("auth");
        expect(error.message).toBe("[log_1] API key was not found");
        expect(error.retryable).toBe(false);
      }
    });

    it("returns error when response missing status field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "OK",
            data: { _responseSignature: signResponse({}, "nps_test") },
          }),
      });

      const transport = createTestTransport();
      const result = await transport.send({
        action: "sdk-collect-payment",
        payload: {},
      });

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        const error = parseError(result.error);
        expect(error.category).toBe("internal");
      }
    });

    it("returns error for tampered response signature", async () => {
      const data = { reference: "ref-123", status: "pending" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: {
              ...data,
              _responseSignature: signResponse(
                { reference: "tampered" },
                "nps_test",
              ),
            },
          }),
      });

      const transport = createTestTransport();
      const result = await transport.send({
        action: "sdk-collect-payment",
        payload: {},
      });

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        const error = parseError(result.error);
        expect(error.category).toBe("internal");
      }
    });
  });

  describe("retry behavior", () => {
    /**
     * Helper: start a send() call and advance fake timers to flush backoff delays.
     * The transport uses delay() with exponential backoff, which relies on setTimeout.
     * With fake timers, we must advance time to let the retries fire.
     */
    async function sendWithTimerFlush(
      transport: ReturnType<typeof createTestTransport>,
    ) {
      const sendPromise = transport.send({
        action: "sdk-collect-payment",
        payload: {},
      });
      // Flush enough time for all possible retry backoffs (2^0*1000 + 2^1*1000 + 2^2*1000 + jitter ≈ 8000ms)
      await vi.advanceTimersByTimeAsync(10_000);
      return sendPromise;
    }

    it.each([
      408, 429, 500, 502, 503, 504,
    ])("retries on HTTP %i", async (statusCode) => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: statusCode,
          statusText: "Error",
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: true,
              message: "OK",
              data: { _responseSignature: signResponse({}, "nps_test") },
            }),
        });

      const transport = createTestTransport();
      const result = await sendWithTimerFlush(transport);

      expect(result.isOk).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it.each([
      400, 401, 403, 404, 422,
    ])("does not retry on HTTP %i", async (statusCode) => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: statusCode,
        statusText: "Error",
        json: () => Promise.resolve({ message: "Client error" }),
      });

      const transport = createTestTransport();
      const result = await sendWithTimerFlush(transport);

      expect(result.isErr).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries on network error", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: true,
              message: "OK",
              data: { _responseSignature: signResponse({}, "nps_test") },
            }),
        });

      const transport = createTestTransport();
      const result = await sendWithTimerFlush(transport);

      expect(result.isOk).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on timeout (AbortError)", async () => {
      const abortError = new DOMException(
        "The operation was aborted",
        "AbortError",
      );
      mockFetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: "OK",
            data: { _responseSignature: signResponse({}, "nps_test") },
          }),
      });

      const transport = createTestTransport();
      const result = await sendWithTimerFlush(transport);

      expect(result.isOk).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("respects max retries", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const transport = createTestTransport();
      const result = await sendWithTimerFlush(transport);

      expect(result.isErr).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("reuses same request body and headers on retry", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: true,
              message: "OK",
              data: { _responseSignature: signResponse({}, "nps_test") },
            }),
        });

      const transport = createTestTransport();
      await sendWithTimerFlush(transport);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [, firstCall] = mockFetch.mock.calls[0];
      const [, secondCall] = mockFetch.mock.calls[1];

      expect(firstCall.body).toBe(secondCall.body);
      expect(firstCall.headers).toEqual(secondCall.headers);
    });
  });
});

describe("parseError", () => {
  it("parses a JSON SdkError envelope", () => {
    const error = parseError(
      '{"category":"not_found","message":"Not found","retryable":false}',
    );
    expect(error.category).toBe("not_found");
    expect(error.message).toBe("Not found");
    expect(error.retryable).toBe(false);
  });

  it("extracts the category from a tagged raw message", () => {
    const error = parseError("Transaction not found -- error-type: not_found");
    expect(error.category).toBe("not_found");
    expect(error.message).toBe("Transaction not found");
  });

  it("falls back to internal for an untagged message", () => {
    const error = parseError("some random error");
    expect(error.category).toBe("internal");
    expect(error.message).toBe("some random error");
  });
});
