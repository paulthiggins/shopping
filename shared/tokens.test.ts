import { afterEach, expect, it, vi } from "vitest";
import { CODE_ALPHABET, generateToken, parseToken, validToken } from "./tokens";
afterEach(() => vi.restoreAllMocks());
it("accepts friendly entry variants while preserving case-sensitive legacy links", () => {
  expect(parseToken("K7M4RT9WX")).toBe("k7m-4rt-9wx");
  expect(parseToken(" k7m-4rt-9wx ")).toBe("k7m-4rt-9wx");
  const legacy = "AbC_" + "x".repeat(39);
  expect(parseToken(legacy)).toBe(legacy);
  for (const invalid of [
    "abc-123-xyz",
    "aaa-ooo-222",
    "too-short",
    "k7m 4rt 9wx",
    "k7m-4rt-9wx-extra",
  ])
    expect(parseToken(invalid)).toBe("");
  expect(validToken(null)).toBe(false);
  expect(validToken("K7M4RT9WX")).toBe(false);
});
it("rejects out-of-range random bytes instead of biasing the alphabet", () => {
  expect(CODE_ALPHABET.length).toBe(31);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    (array as Uint8Array).set([255, 248, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    return array;
  });
  expect(generateToken()).toBe("234-567-89a");
});
