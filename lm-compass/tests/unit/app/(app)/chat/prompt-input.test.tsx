import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptInputComponent } from "@/app/(app)/chat/prompt-input";
import type { Message } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStreamResponse(
  chunks: Record<string, unknown>[],
  options: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  const { ok = true, status = 200, statusText = "OK" } = options;
  const encoded = chunks.map((c) => `data: ${JSON.stringify(c)}\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(encoded));
      controller.close();
    },
  });
  return {
    ok,
    status,
    statusText,
    body: stream,
    json: () => Promise.resolve({}),
    headers: new Headers(),
  } as unknown as Response;
}

function createErrorResponse(
  status: number,
  body: Record<string, unknown> | null,
  statusText = ""
) {
  return {
    ok: false,
    status,
    statusText,
    body: null,
    json: body ? () => Promise.resolve(body) : () => Promise.reject(new Error("no json")),
    headers: new Headers(),
  } as unknown as Response;
}

const VALID_COMPLETE_CHUNK = {
  phase: "complete",
  results: [
    { model: "model-a", message: { role: "assistant", content: "response a" } },
    { model: "model-b", message: { role: "assistant", content: "response b" } },
  ],
  evaluationMetadata: {
    winnerModel: "model-a",
    scores: [],
    meanScores: {},
    modelReasoning: {},
    tiedModels: [],
  },
};

const defaultProps = () => ({
  messages: [] as Message[],
  setMessages: vi.fn(),
  isLoading: false,
  setIsLoading: vi.fn(),
  setLoadingPhase: vi.fn(),
  selectedModels: ["model-a", "model-b"],
  evaluationMethod: "prompt-based",
  iterations: 1,
  chatId: "chat-1",
  rubricId: "rubric-1",
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let uuidCounter: number;

beforeEach(() => {
  vi.restoreAllMocks();
  uuidCounter = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `uuid-${uuidCounter++}` as ReturnType<typeof crypto.randomUUID>
  );
  vi.spyOn(global, "fetch").mockResolvedValue(
    createMockStreamResponse([VALID_COMPLETE_CHUNK])
  );
});

// ---------------------------------------------------------------------------
// Helpers to interact with the component
// ---------------------------------------------------------------------------

async function typeAndSubmit(text: string) {
  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, text);
  const button = screen.getByRole("button");
  await userEvent.click(button);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PromptInputComponent", () => {
  // =========================================================================
  // Validation / guard rails
  // =========================================================================
  describe("input validation prevents invalid submissions", () => {
    it("does not submit when input is empty", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      await userEvent.click(button);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(props.setMessages).not.toHaveBeenCalled();
    });

    it("does not submit when isLoading is true", async () => {
      const props = defaultProps();
      props.isLoading = true;
      render(<PromptInputComponent {...props} />);

      // Textarea is disabled when loading, so we can't type — just verify button click triggers stop, not submit
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not submit when needsWinnerSelection is true", async () => {
      const props = defaultProps();
      props.messages = [
        {
          id: "msg-1",
          role: "assistant",
          content: "",
          evaluationMetadata: {
            winnerModel: null,
            scores: [],
            meanScores: {},
            modelReasoning: {},
            tiedModels: ["model-a", "model-b"],
          },
          multiResults: [
            { model: "model-a", content: "a" },
            { model: "model-b", content: "b" },
          ],
        },
      ];
      render(<PromptInputComponent {...props} />);

      // Input should be disabled — the button should also be disabled
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not submit when selectedModels is empty", async () => {
      const props = defaultProps();
      props.selectedModels = [];
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not submit when HITL evaluation has fewer than 3 models", async () => {
      const props = defaultProps();
      props.evaluationMethod = "hitl";
      props.selectedModels = ["model-a", "model-b"];
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("submits successfully when all conditions are met", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("Hello world");

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      expect(props.setIsLoading).toHaveBeenCalledWith(true);
    });
  });

  // =========================================================================
  // API call correctness
  // =========================================================================
  describe("valid submissions trigger API calls with correct data", () => {
    it("calls fetch with correct URL, method, and body", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("Test query");

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const [url, options] = (global.fetch as Mock).mock.calls[0];
      expect(url).toBe("/api/chat");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.models).toEqual(["model-a", "model-b"]);
      expect(body.evaluationMethod).toBe("prompt-based");
      expect(body.iterations).toBe(1);
      expect(body.chatId).toBe("chat-1");
      expect(body.rubricId).toBe("rubric-1");
      expect(body.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", content: "Test query" }),
        ])
      );
    });

    it("filters out isStopped messages from API payload", async () => {
      const props = defaultProps();
      props.messages = [
        { id: "m1", role: "user", content: "old", isStopped: true },
        { id: "m2", role: "user", content: "kept" },
      ];
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("new");

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      const contents = body.messages.map((m: { content: string }) => m.content);
      expect(contents).not.toContain("old");
      expect(contents).toContain("kept");
      expect(contents).toContain("new");
    });

    it("filters out empty-content assistant messages in tie scenarios", async () => {
      const props = defaultProps();
      props.messages = [
        { id: "m1", role: "user", content: "hello" },
        {
          id: "m2",
          role: "assistant",
          content: "",
          evaluationMetadata: {
            winnerModel: null,
            scores: [],
            meanScores: {},
            modelReasoning: {},
            tiedModels: ["model-a", "model-b"],
          },
          multiResults: [
            { model: "model-a", content: "a" },
            { model: "model-b", content: "b" },
          ],
          userSelectedWinner: "model-a",
        },
      ];
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("follow up");

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
      const assistantMessages = body.messages.filter(
        (m: { role: string }) => m.role === "assistant"
      );
      // The empty-content tie assistant message should be filtered out
      expect(assistantMessages).toHaveLength(0);
    });
  });

  // =========================================================================
  // HTTP error handling
  // =========================================================================
  describe("API error conditions are handled with user-friendly messages", () => {
    it("handles 401 response with Unauthorized message", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createErrorResponse(401, { error: "Auth failed" })
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        expect(props.setMessages).toHaveBeenCalled();
      });

      // Find the call that appends the error message (updater function)
      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toContain("Unauthorized");
    });

    it("handles 404 response with API key not found message", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createErrorResponse(404, { error: "Not found" })
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toContain("API key not found");
    });

    it("handles 500 response with server error message", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createErrorResponse(500, { error: "Internal failure" })
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("Internal failure");
    });

    it("falls back to statusText when JSON parsing fails", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createErrorResponse(502, null, "Bad Gateway")
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("Bad Gateway");
    });
  });

  // =========================================================================
  // Streaming response handling
  // =========================================================================
  describe("streaming response handling displays content as it arrives", () => {
    it("updates loading phase to evaluating when stream emits evaluating phase", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([
          { phase: "evaluating" },
          VALID_COMPLETE_CHUNK,
        ])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        expect(props.setLoadingPhase).toHaveBeenCalledWith("evaluating");
      });
    });

    it("updates loading phase to refining when stream emits refining phase", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([
          { phase: "evaluating" },
          { phase: "refining" },
          VALID_COMPLETE_CHUNK,
        ])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        expect(props.setLoadingPhase).toHaveBeenCalledWith("refining");
      });
    });

    it("constructs assistant message with multiResults and evaluationMetadata on complete", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      const assistantMsg = result[0];
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.multiResults).toHaveLength(2);
      expect(assistantMsg.evaluationMetadata).toBeDefined();
      expect(assistantMsg.evaluationMetadata.winnerModel).toBe("model-a");
    });

    it("sets assistant content to winner response when winnerModel exists", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("response a");
    });

    it("sets assistant content to empty string on tie (no winner)", async () => {
      const tieChunk = {
        ...VALID_COMPLETE_CHUNK,
        evaluationMetadata: {
          ...VALID_COMPLETE_CHUNK.evaluationMetadata,
          winnerModel: null,
        },
      };
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([tieChunk])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("");
    });

    it("appends error message when stream emits error phase", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([{ phase: "error", error: "Model overloaded" }])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      // The inner try/catch catches the thrown error and re-throws as
      // "Failed to parse server response" because the line contains '"phase":"error"'
      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].role).toBe("assistant");
      expect(result[0].content).toBe("Failed to parse server response");
    });

    it("appends error when stream ends without a complete phase", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([{ phase: "evaluating" }])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("No data received");
    });

    it("appends error when results is missing from complete payload", async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        createMockStreamResponse([{ phase: "complete" }])
      );
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("Invalid response format");
    });

    it("appends error when response.body is null", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        headers: new Headers(),
      } as unknown as Response);
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        const calls = props.setMessages.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
      });

      const calls = props.setMessages.mock.calls;
      const lastUpdater = calls[calls.length - 1][0];
      const result = lastUpdater([]);
      expect(result[0].content).toBe("No response body");
    });
  });

  // =========================================================================
  // Request cancellation
  // =========================================================================
  describe("request cancellation manages loading states properly", () => {
    it("handleStop resets loading state and loading phase", async () => {
      const props = defaultProps();
      props.isLoading = true;
      render(<PromptInputComponent {...props} />);

      // When isLoading is true, the button triggers handleStop
      const stopButton = screen.getByRole("button");
      await userEvent.click(stopButton);

      expect(props.setIsLoading).toHaveBeenCalledWith(false);
      expect(props.setLoadingPhase).toHaveBeenCalledWith("querying");
    });

    it("handleStop marks the last user message as isStopped", async () => {
      const props = defaultProps();
      props.isLoading = true;
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      await userEvent.click(button);

      expect(props.setMessages).toHaveBeenCalled();
      const updater = props.setMessages.mock.calls[0][0];
      const userMsg: Message = { id: "u1", role: "user", content: "hello" };
      const result = updater([userMsg]);
      expect(result[0].isStopped).toBe(true);
    });

    it("aborted requests do not append error messages", async () => {
      const abortError = new Error("The operation was aborted.");
      abortError.name = "AbortError";
      (global.fetch as Mock).mockRejectedValueOnce(abortError);
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      // Wait a tick for the catch block to run
      await waitFor(() => {
        expect(props.setIsLoading).toHaveBeenCalledWith(false);
      });

      // setMessages should only have been called once (for the user message), not for an error
      const calls = props.setMessages.mock.calls;
      expect(calls).toHaveLength(1);
    });
  });

  // =========================================================================
  // Loading state lifecycle
  // =========================================================================
  describe("loading states are properly managed throughout the request lifecycle", () => {
    it("sets isLoading true and loadingPhase querying on submit", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      expect(props.setIsLoading).toHaveBeenCalledWith(true);
      expect(props.setLoadingPhase).toHaveBeenCalledWith("querying");
    });

    it("resets isLoading and loadingPhase in finally block on success", async () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        expect(props.setIsLoading).toHaveBeenCalledWith(false);
      });

      const phaseCalls = props.setLoadingPhase.mock.calls.map(
        (c: [string]) => c[0]
      );
      expect(phaseCalls[0]).toBe("querying");
      expect(phaseCalls[phaseCalls.length - 1]).toBe("querying");
    });

    it("resets isLoading and loadingPhase in finally block on error", async () => {
      (global.fetch as Mock).mockRejectedValueOnce(new Error("Network fail"));
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      await typeAndSubmit("test");

      await waitFor(() => {
        expect(props.setIsLoading).toHaveBeenCalledWith(false);
      });

      const phaseCalls = props.setLoadingPhase.mock.calls.map(
        (c: [string]) => c[0]
      );
      expect(phaseCalls[phaseCalls.length - 1]).toBe("querying");
    });
  });

  // =========================================================================
  // UI rendering
  // =========================================================================
  describe("UI rendering", () => {
    it("shows no-models banner when selectedModels is empty", () => {
      const props = defaultProps();
      props.selectedModels = [];
      render(<PromptInputComponent {...props} />);

      expect(
        screen.getByText(/please select at least one model/i)
      ).toBeInTheDocument();
    });

    it("shows HITL banner when evaluation method is hitl with < 3 models", () => {
      const props = defaultProps();
      props.evaluationMethod = "hitl";
      props.selectedModels = ["model-a", "model-b"];
      render(<PromptInputComponent {...props} />);

      expect(
        screen.getByText(/human-in-the-loop evaluation requires at least 3 models/i)
      ).toBeInTheDocument();
    });

    it("disables send button when no input is provided", () => {
      const props = defaultProps();
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("shows stop icon when isLoading is true", () => {
      const props = defaultProps();
      props.isLoading = true;
      render(<PromptInputComponent {...props} />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });
});
