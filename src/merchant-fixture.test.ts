import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  InvoiceResponse,
  Transaction,
  WebhookTransactionSnapshot,
} from "./types";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures",
);

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("recorded backend fixtures", () => {
  it("parses a Transaction without inventing fields", () => {
    const raw = readFixture("merchant-transaction.json");
    const tx = raw as unknown as Transaction;
    expect(tx.status).toBe("failed");
    expect(tx.type).toBe("collection");
    expect(tx.failureCode).toBe("insufficient_balance");
    expect(tx.failureReason).not.toContain("INSUFFICIENT_BALANCE");
    expect(tx.operatorTid).toBe("TEST_AABBCCDD");
    expect(JSON.stringify(tx)).not.toContain("sbx_");
  });

  it("parses a webhook snapshot with collection + legacyType", () => {
    const raw = readFixture("merchant-webhook.json");
    const snapshot = raw as unknown as WebhookTransactionSnapshot;
    expect(snapshot.type).toBe("collection");
    expect(snapshot.legacyType).toBe("charge");
    expect(snapshot.failureCode).toBe("insufficient_balance");
  });

  it("parses InvoiceResponse with paymentLink and a null invoiceNumber", () => {
    const raw = readFixture("merchant-invoice.json");
    const invoice = raw as unknown as InvoiceResponse;
    expect(invoice.paymentLink).toContain("/pay?token=");
    expect(invoice.url).toBe(invoice.paymentLink);
    expect(invoice.invoiceNumber).toBeNull();
  });
});
