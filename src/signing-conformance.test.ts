import { describe, expect, it } from "vitest";
import { createCanonicalPayload, createSignature } from "./signature";

/**
 * Signing conformance, the spec's canonical vectors V1–V7 (requirement S19).
 *
 * These are the conformance vectors published in the Nylon Pay SDK Spec
 * (transport.md, "Conformance vectors"). This package is the reference
 * implementation, so the vectors were generated here and verified against the
 * backend's verifier, pinning them keeps the reference from
 * drifting away from the document every other SDK is built against.
 *
 * Payloads are held as verbatim JSON text from the spec and parsed at test
 * time, so there is no transcription drift between the spec and this file.
 */

const SECRET = "nps_test_conformance_secret";
const FINGERPRINT = "a".repeat(64);
const NONCE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const TIMESTAMP = "1718976000000";

type Vector = {
  canonical: string;
  id: string;
  payload: string;
  signature: string;
};

const VECTORS: Vector[] = [
  {
    id: "V1 representative payload",
    payload: String.raw`{"amount":5000,"currency":"UGX","customer":{"name":"John Doe","phoneNumber":"+256700000000"},"description":"Test payment","reference":"ORDER-2026-001","metadata":{"orderId":"12345","items":"3"}}`,
    canonical: String.raw`{"amount":5000,"currency":"UGX","customer":{"name":"John Doe","phoneNumber":"+256700000000"},"description":"Test payment","metadata":{"items":"3","orderId":"12345"},"reference":"ORDER-2026-001"}`,
    signature:
      "dc6e1717d7c37d7a3b334087d9882c07663edb2dfc8f2f06cd77c0d2d8a58686",
  },
  {
    id: "V2 key insertion order is irrelevant",
    payload: String.raw`{"metadata":{"items":"3","orderId":"12345"},"reference":"ORDER-2026-001","description":"Test payment","customer":{"phoneNumber":"+256700000000","name":"John Doe"},"currency":"UGX","amount":5000}`,
    canonical: String.raw`{"amount":5000,"currency":"UGX","customer":{"name":"John Doe","phoneNumber":"+256700000000"},"description":"Test payment","metadata":{"items":"3","orderId":"12345"},"reference":"ORDER-2026-001"}`,
    signature:
      "dc6e1717d7c37d7a3b334087d9882c07663edb2dfc8f2f06cd77c0d2d8a58686",
  },
  {
    id: "V3 arrays keep order, nested objects sorted",
    payload: String.raw`{"items":[{"unitPrice":2000,"name":"Zeta","quantity":1},{"name":"Alpha","quantity":2,"unitPrice":500}],"tags":["b","a","c"],"amount":4500}`,
    canonical: String.raw`{"amount":4500,"items":[{"name":"Zeta","quantity":1,"unitPrice":2000},{"name":"Alpha","quantity":2,"unitPrice":500}],"tags":["b","a","c"]}`,
    signature:
      "98478585cf5ce0193a9aa6a6e86ff7f5dfc025945d03547dd548b9356b797e4b",
  },
  {
    id: "V4 string escaping",
    payload: String.raw`{"note":"café / 50% <b>&\"quoted\"</b>","path":"a/b/c","backslash":"x\\y","newline":"line1\nline2\ttab"}`,
    canonical: String.raw`{"backslash":"x\\y","newline":"line1\nline2\ttab","note":"café / 50% <b>&\"quoted\"</b>","path":"a/b/c"}`,
    signature:
      "80eb3c6e35b8b3dcc67a57e056634b6f68f2f84b9454bea3aa5e86647eb47649",
  },
  {
    id: "V5 ASCII key ordering",
    payload: String.raw`{"Z":1,"_x":2,"a":3,"A":4,"z":5,"0":6}`,
    canonical: String.raw`{"0":6,"A":4,"Z":1,"_x":2,"a":3,"z":5}`,
    signature:
      "7b9da2fccf0140a7b721715b7b61f17ad3407bd40659b54d983c8e8379108adc",
  },
  {
    id: "V6 empty containers and zero",
    payload: String.raw`{"emptyObject":{},"emptyArray":[],"emptyString":"","zero":0}`,
    canonical: String.raw`{"emptyArray":[],"emptyObject":{},"emptyString":"","zero":0}`,
    signature:
      "f1d8a628663cc9279c675b001e5142e10c6880c2713145f7ebb946c73af2e875",
  },
  {
    id: "V7 non-ASCII key ordering",
    payload: String.raw`{"ÿ":1,"Ā":2,"a":3,"注文":4}`,
    canonical: String.raw`{"a":3,"ÿ":1,"Ā":2,"注文":4}`,
    signature:
      "f43182515649622666b920ac1274d6be5ee395d7c295a4eab6e914a48b212a3a",
  },
];

describe("spec conformance vectors (S19)", () => {
  for (const vector of VECTORS) {
    it(`${vector.id}: canonical payload`, () => {
      expect(createCanonicalPayload(JSON.parse(vector.payload))).toBe(
        vector.canonical,
      );
    });

    it(`${vector.id}: signature`, () => {
      expect(
        createSignature({
          fingerprint: FINGERPRINT,
          nonce: NONCE,
          timestamp: TIMESTAMP,
          payload: JSON.parse(vector.payload),
          secret: SECRET,
        }),
      ).toBe(vector.signature);
    });
  }

  it("V7 distinguishes code-unit order from a UTF-16LE byte sort", () => {
    // A UTF-16LE byte sort compares the low byte first, which is not code-unit
    // order. Asserting the orders genuinely differ keeps V7 from passing by
    // coincidence if a port reintroduces the LE mistake.
    const keys = ["ÿ", "Ā", "a", "注文"];
    const codeUnit = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const littleEndian = [...keys].sort((a, b) => {
      const encode = (value: string) =>
        Buffer.from(value, "utf16le").toString("binary");
      const first = encode(a);
      const second = encode(b);
      return first < second ? -1 : first > second ? 1 : 0;
    });

    expect(codeUnit).toEqual(["a", "ÿ", "Ā", "注文"]);
    expect(littleEndian).not.toEqual(codeUnit);
  });
});
