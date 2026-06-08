import { describe, expect, it } from "vitest";
import { createCanonicalPayload } from "./signature";

describe("createCanonicalPayload (RFC 8785 / JCS)", () => {
  it("sorts object keys by Unicode code point, not locale collation", () => {
    // Under localeCompare these reorder (lowercase-first); code point keeps
    // uppercase (and `_`) ahead of lowercase per UTF-16 order.
    expect(createCanonicalPayload({ a: 1, B: 2, _id: 3, Z: 4 })).toBe(
      '{"B":2,"Z":4,"_id":3,"a":1}',
    );
  });

  it("is key-insertion-order independent (nested)", () => {
    const a = createCanonicalPayload({ b: { y: 1, x: 2 }, a: 3 });
    const b = createCanonicalPayload({ a: 3, b: { x: 2, y: 1 } });
    expect(a).toBe(b);
    expect(a).toBe('{"a":3,"b":{"x":2,"y":1}}');
  });

  it("preserves array order (arrays are not sorted)", () => {
    expect(createCanonicalPayload({ items: [3, 1, 2] })).toBe(
      '{"items":[3,1,2]}',
    );
  });

  it("orders non-BMP and CJK keys by code unit", () => {
    // 'A' (U+0041) < '名' (U+540D) < '🚀' (surrogate high U+D83D).
    expect(createCanonicalPayload({ "🚀": 1, 名: 2, A: 3 })).toBe(
      '{"A":3,"名":2,"🚀":1}',
    );
  });
});
