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
import { buildRubricFromWeights } from "@/lib/rubrics";
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

  it("rejects custom upload when description is empty", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const result = await createRubric({
      mode: "custom",
      title: "Uploaded rubric",
      content: "   ",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Description is required", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("defaults evaluation method for uploaded legacy payload", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRow = {
      id: "rubric-legacy-1",
      rubric_title: "Uploaded Legacy Rubric",
      rubric_content: "Imported rubric text",
      user_id: "user-1",
      mode: "custom",
      category: "prompt-based",
    };
    const { client, spies } = makeCreateChain({ data: dbRow, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await createRubric({
      name: "Uploaded Legacy Rubric",
      description: "Imported rubric text",
    });

    expect(spies.insert).toHaveBeenCalledWith({
      rubric_title: "Uploaded Legacy Rubric",
      rubric_content: "Imported rubric text",
      user_id: "user-1",
      mode: "custom",
      weights_json: null,
      category: "prompt-based",
    });
    expect(result).toEqual({ data: dbRow, success: true });
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

  it("updates custom rubric successfully when authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRow = {
      id: "rubric-1",
      rubric_title: "Updated title",
      rubric_content: "Updated content",
      user_id: "user-1",
      mode: "custom",
      category: "prompt-based,rl4f",
    };
    const { client, spies } = makeUpdateChain({ data: dbRow, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await updateRubric("rubric-1", {
      mode: "custom",
      title: "Updated title",
      content: "Updated content",
      evaluationMethods: ["prompt-based", "rl4f"],
    });

    expect(spies.from).toHaveBeenCalledWith("rubrics");
    expect(spies.update).toHaveBeenCalledWith({
      rubric_title: "Updated title",
      rubric_content: "Updated content",
      mode: "custom",
      weights_json: null,
      category: "prompt-based,rl4f",
    });
    expect(spies.eqId).toHaveBeenCalledWith("id", "rubric-1");
    expect(spies.eqUserId).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual({ data: dbRow, success: true });
  });

  it("returns error when update rubric id is missing", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const result = await updateRubric("", {
      mode: "custom",
      title: "Updated title",
      content: "Updated content",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Rubric ID is required", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns error when update title is empty", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const result = await updateRubric("rubric-1", {
      mode: "custom",
      title: "   ",
      content: "Updated content",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Name is required", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns error when custom update content is empty", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);

    const result = await updateRubric("rubric-1", {
      mode: "custom",
      title: "Updated title",
      content: "   ",
      evaluationMethods: ["prompt-based"],
    });

    expect(result).toEqual({ error: "Description is required", success: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("defaults evaluation method on update when list is empty", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRow = {
      id: "rubric-1",
      rubric_title: "Updated title",
      rubric_content: "Updated content",
      user_id: "user-1",
      mode: "custom",
      category: "prompt-based",
    };
    const { client, spies } = makeUpdateChain({ data: dbRow, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await updateRubric("rubric-1", {
      mode: "custom",
      title: "Updated title",
      content: "Updated content",
      evaluationMethods: [],
    });

    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ category: "prompt-based" })
    );
    expect(result).toEqual({ data: dbRow, success: true });
  });

  it("updates weight-adjusted rubric and stores generated content", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const dbRow = {
      id: "rubric-1",
      rubric_title: "Weighted title",
      rubric_content: "Generated rubric content",
      user_id: "user-1",
      mode: "weight-adjusted-default",
      category: "rl4f",
    };
    const { client, spies } = makeUpdateChain({ data: dbRow, error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await updateRubric("rubric-1", {
      mode: "weight-adjusted-default",
      title: "Weighted title",
      weights: { Accuracy: 100 },
      categoryLabels: { Accuracy: "Faithfulness" },
      categoryDescriptions: { Accuracy: "Measures factual consistency" },
      evaluationMethods: ["rl4f"],
    });

    expect(vi.mocked(buildRubricFromWeights)).toHaveBeenCalledWith(
      [
        {
          key: "Accuracy",
          description: "Checks factual correctness",
          defaultPoints: 100,
        },
      ],
      { Accuracy: 100 },
      {
        labels: { Accuracy: "Faithfulness" },
        descriptions: { Accuracy: "Measures factual consistency" },
      }
    );
    expect(spies.update).toHaveBeenCalledWith({
      rubric_title: "Weighted title",
      rubric_content: "Generated rubric content",
      mode: "weight-adjusted-default",
      weights_json: {
        weights: { Accuracy: 100 },
        labels: { Accuracy: "Faithfulness" },
        descriptions: { Accuracy: "Measures factual consistency" },
      },
      category: "rl4f",
    });
    expect(result).toEqual({ data: dbRow, success: true });
  });

  it("deletes rubric successfully when authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    const { client, spies } = makeDeleteChain({ error: null });
    mockCreateClient.mockResolvedValue(asMockedSupabaseClient(client));

    const result = await deleteRubric("rubric-99");

    expect(spies.from).toHaveBeenCalledWith("rubrics");
    expect(spies.del).toHaveBeenCalledTimes(1);
    expect(spies.eq).toHaveBeenCalledWith("id", "rubric-99");
    expect(result).toEqual({ success: true });
  });

  it("returns internal server error when delete throws non-Error", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof auth>>);
    mockCreateClient.mockRejectedValue("boom");

    const result = await deleteRubric("rubric-1");

    expect(result).toEqual({
      success: false,
      error: "Internal server error",
    });
  });
});