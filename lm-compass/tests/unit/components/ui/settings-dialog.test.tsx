import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { saveOpenRouterKey } from "@/app/(app)/settings/actions";

vi.mock("@/app/(app)/settings/actions", () => ({
  saveOpenRouterKey: vi.fn(),
}));

const mockedSave = vi.mocked(saveOpenRouterKey);

const VALID_KEY = "sk-or-v1-" + "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSave.mockResolvedValue({ success: true });
});

function renderDialog(overrides: { open?: boolean; onOpenChange?: (v: boolean) => void } = {}) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  render(
    <SettingsDialog open={overrides.open ?? true} onOpenChange={onOpenChange} />
  );
  return { onOpenChange };
}

function getSaveButton() {
  return screen.getByRole("button", { name: /save key/i });
}

function getCancelButton() {
  return screen.getByRole("button", { name: /cancel/i });
}

function getInput() {
  return screen.getByPlaceholderText("sk-or-v1-...");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsDialog", () => {
  // =========================================================================
  // API key format validation
  // =========================================================================
  describe("invalid API key formats are detected and appropriate error messages are displayed", () => {
    it("disables Save Key button when input is empty", () => {
      renderDialog();
      expect(getSaveButton()).toBeDisabled();
    });

    it("shows validation error for key missing sk-or-v1- prefix", async () => {
      renderDialog();
      await userEvent.type(getInput(), "invalid-key-format");
      await userEvent.click(getSaveButton());

      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      expect(mockedSave).not.toHaveBeenCalled();
    });

    it("shows validation error for key with correct prefix but wrong length", async () => {
      renderDialog();
      await userEvent.type(getInput(), "sk-or-v1-abc");
      await userEvent.click(getSaveButton());

      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      expect(mockedSave).not.toHaveBeenCalled();
    });

    it("shows validation error for key with special characters in 64-char portion", async () => {
      const keyWithSpecial = "sk-or-v1-" + "a".repeat(60) + "!@#$";
      renderDialog();
      await userEvent.type(getInput(), keyWithSpecial);
      await userEvent.click(getSaveButton());

      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      expect(mockedSave).not.toHaveBeenCalled();
    });

    it("accepts valid key format and calls saveOpenRouterKey", async () => {
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(mockedSave).toHaveBeenCalledWith(VALID_KEY);
      });
    });

    it("does NOT call saveOpenRouterKey when validation fails", async () => {
      renderDialog();
      await userEvent.type(getInput(), "bad");
      await userEvent.click(getSaveButton());

      expect(mockedSave).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Successful save flow
  // =========================================================================
  describe("valid submissions trigger save operations correctly with proper UI feedback", () => {
    it("calls onOpenChange(false) to close the dialog on success", async () => {
      const { onOpenChange } = renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("clears the key input after successful save", async () => {
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(getInput()).toHaveValue("");
      });
    });
  });

  // =========================================================================
  // Failed save flow
  // =========================================================================
  describe("failure scenarios are handled appropriately with proper UI feedback", () => {
    it("displays server error message from result.error", async () => {
      mockedSave.mockResolvedValueOnce({ success: false, error: "Encryption failed" });
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByText("Encryption failed")).toBeInTheDocument();
      });
    });

    it("displays fallback error when result.error is undefined", async () => {
      mockedSave.mockResolvedValueOnce({ success: false } as { success: false; error: string });
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByText("Failed to save API key")).toBeInTheDocument();
      });
    });

    it("dialog remains open on failure", async () => {
      mockedSave.mockResolvedValueOnce({ success: false, error: "DB down" });
      const { onOpenChange } = renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByText("DB down")).toBeInTheDocument();
      });
      // onOpenChange should NOT have been called with false for closing
      const closeCalls = (onOpenChange as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: [boolean]) => c[0] === false
      );
      expect(closeCalls).toHaveLength(0);
    });
  });

  // =========================================================================
  // Loading states
  // =========================================================================
  describe("loading states are managed correctly", () => {
    it("shows Saving... on the save button while loading", async () => {
      let resolvePromise!: (v: { success: boolean }) => void;
      mockedSave.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
      });

      // Resolve to clean up
      resolvePromise({ success: true });
    });

    it("disables the input field while loading", async () => {
      let resolvePromise!: (v: { success: boolean }) => void;
      mockedSave.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(getInput()).toBeDisabled();
      });

      resolvePromise({ success: true });
    });

    it("disables both Cancel and Save buttons while loading", async () => {
      let resolvePromise!: (v: { success: boolean }) => void;
      mockedSave.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );
      renderDialog();
      await userEvent.type(getInput(), VALID_KEY);
      await userEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
      });
      expect(getCancelButton()).toBeDisabled();

      resolvePromise({ success: true });
    });
  });

  // =========================================================================
  // Error clearing
  // =========================================================================
  describe("input clearing behaviours", () => {
    it("typing in the input clears a previously displayed error", async () => {
      renderDialog();
      await userEvent.type(getInput(), "bad");
      await userEvent.click(getSaveButton());

      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();

      await userEvent.type(getInput(), "x");

      expect(screen.queryByText(/invalid api key format/i)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Form state on close
  // =========================================================================
  describe("form state is managed correctly on close", () => {
    it("closing the dialog clears key and error state", async () => {
      renderDialog();

      await userEvent.type(getInput(), "bad");
      await userEvent.click(getSaveButton());
      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();

      await userEvent.click(getCancelButton());

      await waitFor(() => {
        expect(getInput()).toHaveValue("");
      });
      expect(screen.queryByText(/invalid api key format/i)).not.toBeInTheDocument();
    });
  });
});
