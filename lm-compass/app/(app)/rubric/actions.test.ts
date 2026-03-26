import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/rubrics", () => ({
  buildRubricFromWeights: vi.fn(() => "Generated rubric content"),
  loadDefaultRubricText: vi.fn(
    () => "Accuracy (100 points) - Checks factual correctness"
  ),
  parseDefaultRubric: vi.fn(() => [
    {
      key: "Accuracy",
      description: "Checks factual correctness",
      defaultPoints: 100,
    },
  ]),
}));

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/utils/supabase/server";
import {
  createRubric,
  deleteRubric,
  getRubrics,
  updateRubric,
} from "./actions";

const mockAuth = vi.mocked(auth);
const mockCreateClient = vi.mocked(createClient);
type MockedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function asMockedSupabaseClient<T>(client: T): MockedSupabaseClient {
  return client as unknown as MockedSupabaseClient;
}

function makeCreateChain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });

  return {
    client: { from },
    spies: { from, insert, select, single },
  };
}

function makeUpdateChain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eqUserId = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  const from = vi.fn().mockReturnValue({ update });

  return {
    client: { from },
    spies: { from, update, eqId, eqUserId, select, single },
  };
}

function makeGetChain(result: { data: unknown; error: { message: string } | null }) {
  const order = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from },
    spies: { from, select, eq, order },
  };
}

function makeDeleteChain(result: { error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const del = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ delete: del });

  return {
    client: { from },
    spies: { from, del, eq },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRubric", () => {
  it("returns unauthorized when no authenticated user exists", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);

    const result = await createRubric({
      mode: "custom",
      title: "Rubric",
      content: "Some rubric",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Unauthorized", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("enforces required fields for custom mode", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const result = await createRubric({
      mode: "custom",
      title: "   ",
      content: "Some rubric",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Name is required", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns created rubric data on success", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRow = {
      id: "rubric-1",
      rubric_title: "My Rubric",
      rubric_content: "Rubric details",
      user_id: "user-1",
      mode: "custom",
      category: "prompt-based,rl4f",
    };
    const { client, spies } = makeCreateChain({ data: dbRow, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await createRubric({
      mode: "custom",
      title: "My Rubric",
      content: "Rubric details",
      evaluationMethods: ["prompt-based", "rl4f"],
    });

    expect(spies.from).toHaveBeenCalledWith("rubrics");
    expect(spies.insert).toHaveBeenCalledWith({
      rubric_title: "My Rubric",
      rubric_content: "Rubric details",
      user_id: "user-1",
      mode: "custom",
      weights_json: null,
      category: "prompt-based,rl4f",
    });
    expect(result).toEqual({ data: dbRow, success: true });
  });

  it("returns database errors to caller", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const { client } = makeCreateChain({
      data: null,
      error: { message: "insert failed" },
    });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await createRubric({
      mode: "custom",
      title: "My Rubric",
      content: "Rubric details",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "insert failed", success: false });
  });
});

describe("getRubrics", () => {
  it("returns unauthorized when no authenticated user exists", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);

    const result = await getRubrics();

    expect(result).toEqual({ error: "Unauthorized", success: false, data: null });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns rubric list ordered by most recent", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRows = [
      { id: "rubric-2", rubric_title: "Second" },
      { id: "rubric-1", rubric_title: "First" },
    ];
    const { client, spies } = makeGetChain({ data: dbRows, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await getRubrics();

    expect(spies.from).toHaveBeenCalledWith("rubrics");
    expect(spies.select).toHaveBeenCalledWith("*");
    expect(spies.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(spies.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual({ data: dbRows, success: true });
  });

  it("returns database errors to caller", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const { client } = makeGetChain({
      data: null,
      error: { message: "select failed" },
    });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await getRubrics();

    expect(result).toEqual({ error: "select failed", success: false, data: null });
  });
});

describe("authentication checks on remaining actions", () => {
  it("blocks updateRubric without authentication", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);

    const result = await updateRubric("rubric-1", {
      mode: "custom",
      title: "Updated title",
      content: "Updated content",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Unauthorized", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("blocks deleteRubric without authentication", async () => {
    mockAuth.mockResolvedValue({ userId: null } as Awaited<ReturnType<typeof auth>>);

    const result = await deleteRubric("rubric-1");

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns update and delete database errors", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const updateChain = makeUpdateChain({
      data: null,
      error: { message: "update failed" },
    });
    mockCreateClient.mockResolvedValueOnce(
      asMockedSupabaseClient(updateChain.client)
    );

    const updateResult = await updateRubric("rubric-1", {
      mode: "custom",
      title: "Updated title",
      content: "Updated content",
      evaluationMethods: ["prompt-based"],
    });

    expect(updateResult).toEqual({ error: "update failed", success: false });

    const deleteChain = makeDeleteChain({ error: { message: "delete failed" } });
    mockCreateClient.mockResolvedValueOnce(
      asMockedSupabaseClient(deleteChain.client)
    );

    const deleteResult = await deleteRubric("rubric-1");

    expect(deleteResult).toEqual({ success: false, error: "delete failed" });
  });
});