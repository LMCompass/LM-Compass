import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn() }));
vi.mock("openai", () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));
vi.mock("@/lib/chat-storage", () => ({
  saveChat: vi.fn(),
  loadAllMessages: vi.fn().mockResolvedValue({ messages: [] }),
}));
vi.mock("@/lib/evaluation", () => ({
  PromptBasedEvaluator: vi.fn().mockImplementation(() => ({
    evaluate: vi.fn(),
  })),
  NPromptBasedEvaluator: vi.fn(),
  RL4FEvaluator: vi.fn(),
  GradeHITLEvaluator: vi.fn(),
}));

import { POST } from "./route";
import { auth } from "@clerk/nextjs/server";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/encryption";
import { OpenAI } from "openai";
import { loadAllMessages } from "@/lib/chat-storage";
import { PromptBasedEvaluator } from "@/lib/evaluation";

const mockAuth = vi.mocked(auth);
const mockCreateClient = vi.mocked(createClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockDecrypt = vi.mocked(decrypt);
const mockOpenAI = vi.mocked(OpenAI);
const mockLoadAllMessages = vi.mocked(loadAllMessages);
const mockPromptBasedEvaluator = vi.mocked(PromptBasedEvaluator);

const mockFrom = {
  select: vi.fn().mockImplementation(() => mockFrom),
  eq: vi.fn().mockImplementation(() => mockFrom),
  single: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();

  mockFrom.select.mockImplementation(() => mockFrom);
  mockFrom.eq.mockImplementation(() => mockFrom);

  mockCreateClient.mockReturnValue(Promise.resolve({ from: vi.fn().mockReturnValue(mockFrom) }) as unknown as ReturnType<typeof createClient>);
  mockCreateAdminClient.mockReturnValue(Promise.resolve({}) as unknown as ReturnType<typeof createAdminClient>);
  mockLoadAllMessages.mockResolvedValue({ messages: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

const buildRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/chat route", () => {
  it("supabase mock chain sanity check", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockCreateClient.mockReturnValue(Promise.resolve({ from: vi.fn().mockReturnValue(mockFrom) }) as unknown as ReturnType<typeof createClient>);
    mockFrom.single.mockResolvedValue({ data: { openrouter_api_key: null }, error: null });

    const supabase = await createClient();
    const fromResult = supabase.from("user_settings");
    expect(fromResult).toBe(mockFrom);

    const selectResult = fromResult.select("openrouter_api_key");
    expect(selectResult).toBe(mockFrom);
    expect(selectResult.eq).toBeDefined();

    const eqResult = selectResult.eq("user_id", "user-1");
    const data = await eqResult.single();
    expect(data).toEqual({ data: { openrouter_api_key: null }, error: null });
  });

  it("rejects unauthenticated requests with 401", async () => {
    mockAuth.mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects when OpenRouter API key is missing from settings", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockFrom.single.mockResolvedValue({ data: { openrouter_api_key: null }, error: null });

    const res = await POST(buildRequest({ messages: [{ role: "user", content: "hi" }] }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "OpenRouter API key not found. Please add it in the settings.",
    });
  });

  it("rejects missing model selection with 400", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockFrom.single.mockResolvedValue({ data: { openrouter_api_key: "encrypted-key" }, error: null });
    mockDecrypt.mockReturnValue("clear-key");

    const res = await POST(buildRequest({ messages: [{ role: "user", content: "hi" }] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No models selected. Please select at least one model before querying.",
    });
  });

  it("returns a friendly error when external OpenRouter response indicates invalid key", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockFrom.single.mockResolvedValue({ data: { openrouter_api_key: "encrypted-key" }, error: null });
    mockDecrypt.mockReturnValue("clear-key");

    const openAIInstance = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("401 User not found")),
        },
      },
    };
    mockOpenAI.mockImplementation(() => openAIInstance as unknown as InstanceType<typeof OpenAI>);

    const res = await POST(buildRequest({
      messages: [{ role: "user", content: "Hello" }],
      model: "text-model",
    }));

    expect(res.status).toBe(200);
    const responseText = await res.text();
    expect(responseText).toContain("data: {\"phase\":\"complete\"" );
    expect(responseText).toContain(
      "The OpenRouter API key is invalid. Please update with a valid key in settings.",
    );
  });

  it("handles evaluation failures gracefully and returns evaluationError in stream", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockFrom.single.mockResolvedValue({ data: { openrouter_api_key: "encrypted-key" }, error: null });
    mockDecrypt.mockReturnValue("clear-key");

    const openAIInstance = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async ({ model }: { model: string }) => ({
            choices: [{ message: { content: `reply from ${model}` } }],
          })),
        },
      },
    };
    mockOpenAI.mockImplementation(() => openAIInstance as unknown as InstanceType<typeof OpenAI>);

    const evaluatorMock = {
      evaluate: vi.fn().mockRejectedValue(new Error("Evaluation pipeline crashed")),
    };
    mockPromptBasedEvaluator.mockImplementation(() => evaluatorMock as unknown as InstanceType<typeof PromptBasedEvaluator>);

    const res = await POST(buildRequest({
      messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hey" }],
      models: ["model-a", "model-b"],
      evaluationMethod: "prompt-based",
    }));

    expect(res.status).toBe(200);
    const responseText = await res.text();

    expect(responseText).toContain("data: {\"phase\":\"complete\"" );
    expect(responseText).toContain("evaluationError");
    expect(responseText).toContain("Evaluation pipeline crashed");
  });
});
