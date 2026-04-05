import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decrypt, encrypt } from "@/lib/encryption";

const VALID_KEY_32 = "0123456789abcdef0123456789abcdef";

describe("encryption module", () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = VALID_KEY_32;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.DATA_ENCRYPTION_KEY;
    } else {
      process.env.DATA_ENCRYPTION_KEY = originalKey;
    }
  });

  describe("DATA_ENCRYPTION_KEY validation", () => {
    it("rejects a missing key when encrypting", () => {
      delete process.env.DATA_ENCRYPTION_KEY;
      expect(() => encrypt("secret")).toThrow(
        "DATA_ENCRYPTION_KEY must be 32 characters long",
      );
    });

    it("rejects a missing key when decrypting", () => {
      delete process.env.DATA_ENCRYPTION_KEY;
      expect(() => decrypt("aabb:")).toThrow(
        "DATA_ENCRYPTION_KEY must be 32 characters long",
      );
    });

    it("rejects a key shorter than 32 characters", () => {
      process.env.DATA_ENCRYPTION_KEY = "x".repeat(31);
      expect(() => encrypt("x")).toThrow(
        "DATA_ENCRYPTION_KEY must be 32 characters long",
      );
    });

    it("rejects a key longer than 32 characters", () => {
      process.env.DATA_ENCRYPTION_KEY = "x".repeat(33);
      expect(() => decrypt("00:" + "11")).toThrow(
        "DATA_ENCRYPTION_KEY must be 32 characters long",
      );
    });
  });

  describe("encrypt and decrypt", () => {
    it("round-trips plaintext", () => {
      const plain = "openrouter-api-key-value";
      const cipher = encrypt(plain);
      expect(cipher).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
      expect(decrypt(cipher)).toBe(plain);
    });

    it("round-trips unicode and empty string", () => {
      expect(decrypt(encrypt(""))).toBe("");
      const unicode = "hello 世界 🧭";
      expect(decrypt(encrypt(unicode))).toBe(unicode);
    });

    it("produces different ciphertext for the same plaintext (random IV)", () => {
      const plain = "same";
      const a = encrypt(plain);
      const b = encrypt(plain);
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe(plain);
      expect(decrypt(b)).toBe(plain);
    });

    it("throws or corrupts when decrypting with a different key", () => {
      const cipher = encrypt("secret");
      process.env.DATA_ENCRYPTION_KEY = "fedcba9876543210fedcba9876543210";
      expect(() => decrypt(cipher)).toThrow(); // only valid if authenticated
    });
  });

  describe("invalid or corrupted ciphertext", () => {
    it("throws when ciphertext has no colon separator", () => {
      expect(() => decrypt("deadbeef")).toThrow();
    });

    it("throws when IV segment is not valid hex", () => {
      expect(() => decrypt("nothex:" + "00")).toThrow();
    });

    it("throws when payload segment is not valid hex", () => {
      const iv = "0".repeat(32);
      expect(() => decrypt(`${iv}:zzzz`)).toThrow();
    });

    it("throws when ciphertext is truncated or tampered", () => {
      const cipher = encrypt("payload");
      const [ivHex, payloadHex] = cipher.split(":");
      const truncated = `${ivHex}:${payloadHex.slice(0, -4)}`;
      expect(() => decrypt(truncated)).toThrow();

      const flipped =
        payloadHex.slice(0, -1) +
        (payloadHex.at(-1) === "0" ? "1" : "0");
      expect(() => decrypt(`${ivHex}:${flipped}`)).toThrow();
    });
  });
});
