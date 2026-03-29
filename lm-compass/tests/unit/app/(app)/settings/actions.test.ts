import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, createClientMock, encryptMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createClientMock: vi.fn(),
  encryptMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: encryptMock,
}));

import { hasApiKey, saveOpenRouterKey } from "@/app/(app)/settings/actions";

describe("settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveOpenRouterKey", () => {
    it("rejects unauthorized requests", async () => {
      authMock.mockResolvedValue({ userId: null });

      const result = await saveOpenRouterKey("or-key");

      expect(result).toEqual({ error: "Unauthorized", success: false });
      expect(encryptMock).not.toHaveBeenCalled();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it("encrypts API key before upsert and saves user settings", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });
      encryptMock.mockReturnValue("encrypted-key");

      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });
      createClientMock.mockResolvedValue({ from: fromMock });

      const result = await saveOpenRouterKey("plain-openrouter-key");

      expect(result).toEqual({ success: true });
      expect(encryptMock).toHaveBeenCalledWith("plain-openrouter-key");
      expect(fromMock).toHaveBeenCalledWith("user_settings");
      expect(upsertMock).toHaveBeenCalledTimes(1);

      const upsertPayload = upsertMock.mock.calls[0][0];
      expect(upsertPayload).toMatchObject({
        user_id: "user_123",
        openrouter_api_key: "encrypted-key",
      });
      expect(typeof upsertPayload.updated_at).toBe("string");
      expect(Number.isNaN(Date.parse(upsertPayload.updated_at))).toBe(false);
    });

    it("returns database error when upsert fails", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });
      encryptMock.mockReturnValue("encrypted-key");

      const upsertMock = vi.fn().mockResolvedValue({
        error: { message: "db write failed" },
      });
      createClientMock.mockResolvedValue({
        from: vi.fn().mockReturnValue({ upsert: upsertMock }),
      });

      const result = await saveOpenRouterKey("plain-openrouter-key");

      expect(result).toEqual({ error: "db write failed", success: false });
    });

    it("returns failure when auth throws", async () => {
      authMock.mockRejectedValue(new Error("auth unavailable"));

      const result = await saveOpenRouterKey("plain-openrouter-key");

      expect(result).toEqual({ error: "auth unavailable", success: false });
    });
  });

  describe("hasApiKey", () => {
    it("rejects unauthorized requests", async () => {
      authMock.mockResolvedValue({ userId: null });

      const result = await hasApiKey();

      expect(result).toEqual({ hasKey: false, error: "Unauthorized" });
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it("returns hasKey true when encrypted key exists", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });

      const singleMock = vi.fn().mockResolvedValue({
        data: { openrouter_api_key: "encrypted-key" },
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ single: singleMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      const fromMock = vi.fn().mockReturnValue({ select: selectMock });
      createClientMock.mockResolvedValue({ from: fromMock });

      const result = await hasApiKey();

      expect(result).toEqual({ hasKey: true });
      expect(fromMock).toHaveBeenCalledWith("user_settings");
      expect(selectMock).toHaveBeenCalledWith("openrouter_api_key");
      expect(eqMock).toHaveBeenCalledWith("user_id", "user_123");
    });

    it("returns hasKey false when key is missing", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });

      const singleMock = vi.fn().mockResolvedValue({
        data: { openrouter_api_key: null },
        error: null,
      });
      createClientMock.mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: singleMock }),
          }),
        }),
      });

      const result = await hasApiKey();

      expect(result).toEqual({ hasKey: false });
    });

    it("returns hasKey false when query fails", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });

      const singleMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "record not found" },
      });
      createClientMock.mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: singleMock }),
          }),
        }),
      });

      const result = await hasApiKey();

      expect(result).toEqual({ hasKey: false });
    });

    it("returns fallback error when unexpected failure occurs", async () => {
      authMock.mockResolvedValue({ userId: "user_123" });
      createClientMock.mockRejectedValue(new Error("supabase unavailable"));

      const result = await hasApiKey();

      expect(result).toEqual({
        hasKey: false,
        error: "Failed to check API key",
      });
    });
  });
});
