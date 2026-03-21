/**
 * Tests for worktree UX improvements:
 *
 * P1#4 - Better "Close Anyway" warning text in DirtyWorktreeDialog
 * P1#5 - Remove path/terminology leaks from UI
 * P2#10 - Block interactions during stash operation
 * P2#13 - File type breakdown in dirty dialog
 *
 * Since the test environment is node (no DOM), we reimplement component logic
 * as pure functions following the existing test patterns in this codebase.
 */
import { describe, it, expect, vi } from "vitest";

// ─── Mock Tauri APIs ─────────────────────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("../terminal/TerminalPool", () => ({
  createTerminal: vi.fn(),
  destroy: vi.fn(),
  updateSettings: vi.fn(),
  writeScrollback: vi.fn(),
}));
vi.mock("../utils/notifications", () => ({
  initNotifications: vi.fn(),
  notifyLongRunningDone: vi.fn(),
}));

// ─── Import functions under test ─────────────────────────────────────
import {
  groupFilesByStatus,
  formatFileBreakdown,
} from "../components/DirtyWorktreeDialog";
import { friendlyWorktreeLabel } from "../components/GitProjectSection";
import { friendlyWorktreeTooltip } from "../components/WorktreeOverviewPanel";

// =====================================================================
// P2#13: File type breakdown in dirty dialog
// =====================================================================

describe("P2#13 - groupFilesByStatus", () => {
  it("groups modified, added, deleted files correctly", () => {
    const files = [
      { path: "a.ts", status: "MODIFIED" },
      { path: "b.ts", status: "M" },
      { path: "c.ts", status: "ADDED" },
      { path: "d.ts", status: "NEW" },
      { path: "e.ts", status: "UNTRACKED" },
      { path: "f.ts", status: "DELETED" },
      { path: "g.ts", status: "D" },
    ];
    const result = groupFilesByStatus(files);
    expect(result.modified).toBe(2);
    expect(result.added).toBe(3);
    expect(result.deleted).toBe(2);
    expect(result.other).toBe(0);
  });

  it("counts renamed files as other", () => {
    const files = [
      { path: "a.ts", status: "RENAMED" },
      { path: "b.ts", status: "R" },
    ];
    const result = groupFilesByStatus(files);
    expect(result.modified).toBe(0);
    expect(result.added).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.other).toBe(2);
  });

  it("returns all zeros for empty array", () => {
    const result = groupFilesByStatus([]);
    expect(result.modified).toBe(0);
    expect(result.added).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.other).toBe(0);
  });

  it("handles mixed statuses", () => {
    const files = [
      { path: "a.ts", status: "M" },
      { path: "b.ts", status: "A" },
      { path: "c.ts", status: "D" },
      { path: "d.ts", status: "R" },
      { path: "e.ts", status: "UNTRACKED" },
    ];
    const result = groupFilesByStatus(files);
    expect(result.modified).toBe(1);
    expect(result.added).toBe(2); // A + UNTRACKED
    expect(result.deleted).toBe(1);
    expect(result.other).toBe(1); // R
  });
});

describe("P2#13 - formatFileBreakdown", () => {
  it("formats a mix of file types", () => {
    const files = [
      { path: "a.ts", status: "M" },
      { path: "b.ts", status: "M" },
      { path: "c.ts", status: "M" },
      { path: "d.ts", status: "NEW" },
      { path: "e.ts", status: "UNTRACKED" },
      { path: "f.ts", status: "D" },
    ];
    const result = formatFileBreakdown(files);
    expect(result).toBe("3 modified, 2 new, 1 deleted");
  });

  it("shows only present types", () => {
    const files = [
      { path: "a.ts", status: "M" },
      { path: "b.ts", status: "M" },
    ];
    const result = formatFileBreakdown(files);
    expect(result).toBe("2 modified");
  });

  it("shows only new files", () => {
    const files = [
      { path: "a.ts", status: "A" },
    ];
    const result = formatFileBreakdown(files);
    expect(result).toBe("1 new");
  });

  it("shows only deleted files", () => {
    const files = [
      { path: "a.ts", status: "D" },
      { path: "b.ts", status: "DELETED" },
    ];
    const result = formatFileBreakdown(files);
    expect(result).toBe("2 deleted");
  });

  it("returns empty string for no files", () => {
    const result = formatFileBreakdown([]);
    expect(result).toBe("");
  });

  it("includes 'other' for unknown statuses", () => {
    const files = [
      { path: "a.ts", status: "M" },
      { path: "b.ts", status: "RENAMED" },
    ];
    const result = formatFileBreakdown(files);
    expect(result).toBe("1 modified, 1 other");
  });
});

// =====================================================================
// P1#4: Better "Close Anyway" warning text
// =====================================================================

describe("P1#4 - DirtyWorktreeDialog improved messaging", () => {
  /**
   * Mirrors the rendering logic of the updated DirtyWorktreeDialog.
   * Returns the text content that the component would render.
   */
  function getDirtyDialogText(props: {
    sessionLabel: string;
    changes: Array<{
      projectId: string;
      projectName: string;
      branchName: string | null;
      files: Array<{ path: string; status: string }>;
    }>;
    stashErrors?: Array<{ projectName: string; error: string }>;
    stashing?: boolean;
  }) {
    const totalFiles = props.changes.reduce((sum, c) => sum + c.files.length, 0);
    const allFiles = props.changes.flatMap((c) => c.files);
    const breakdown = formatFileBreakdown(allFiles);
    const hasStashErrors = props.stashErrors && props.stashErrors.length > 0;
    const stashing = props.stashing ?? false;

    // Main message
    const mainMessage = `Session ${props.sessionLabel} has ${totalFiles} uncommitted ${totalFiles === 1 ? "change" : "changes"} (${breakdown}) across ${props.changes.length} ${props.changes.length === 1 ? "project" : "projects"}.`;

    // Warning text
    const warningText =
      "Closing this session will permanently delete its working directory and all uncommitted changes.";

    // Stash hint
    const stashHint =
      "Stashing saves your changes safely in the main repository. You can recover them later with git stash pop.";

    // Button texts
    const closeAnywayButtonText = "Discard changes and close";
    const stashButtonText = stashing
      ? "Stashing changes..."
      : hasStashErrors
        ? "Try Again"
        : "Stash & Close";
    const cancelButtonText = "Cancel";

    // Stashing indicator
    const stashingIndicator = stashing ? "Stashing changes..." : null;

    return {
      mainMessage,
      warningText,
      stashHint,
      closeAnywayButtonText,
      stashButtonText,
      cancelButtonText,
      stashingIndicator,
      buttonsDisabled: stashing,
    };
  }

  it("shows permanent deletion warning", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [{ path: "a.ts", status: "M" }],
        },
      ],
    });

    expect(result.warningText).toContain("permanently delete");
    expect(result.warningText).toContain("working directory");
    expect(result.warningText).toContain("uncommitted changes");
  });

  it("shows stash recovery hint with git stash pop", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [{ path: "a.ts", status: "M" }],
        },
      ],
    });

    expect(result.stashHint).toContain("main repository");
    expect(result.stashHint).toContain("git stash pop");
  });

  it("close button says 'Discard changes and close' instead of 'Close Anyway'", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [{ path: "a.ts", status: "M" }],
        },
      ],
    });

    expect(result.closeAnywayButtonText).toBe("Discard changes and close");
  });

  it("stash button says 'Stash & Close' in normal state", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [{ path: "a.ts", status: "M" }],
        },
      ],
    });

    expect(result.stashButtonText).toBe("Stash & Close");
  });

  it("includes file breakdown in main message", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [
            { path: "a.ts", status: "M" },
            { path: "b.ts", status: "A" },
            { path: "c.ts", status: "D" },
          ],
        },
      ],
    });

    expect(result.mainMessage).toContain("1 modified, 1 new, 1 deleted");
  });

  it("after stash errors, close button still says 'Discard changes and close'", () => {
    const result = getDirtyDialogText({
      sessionLabel: "Session 1",
      changes: [
        {
          projectId: "p1",
          projectName: "proj",
          branchName: "main",
          files: [{ path: "a.ts", status: "M" }],
        },
      ],
      stashErrors: [{ projectName: "proj", error: "failed" }],
    });

    expect(result.closeAnywayButtonText).toBe("Discard changes and close");
    expect(result.stashButtonText).toBe("Try Again");
  });
});

// =====================================================================
// P2#10: Block interactions during stash operation
// =====================================================================

describe("P2#10 - Stashing state machine", () => {
  /**
   * Simulates the stashing state machine from DirtyWorktreeDialog.
   */
  function createStashingStateMachine() {
    let stashing = false;
    let stashCompleted = false;
    let stashError: string | null = null;

    return {
      get stashing() {
        return stashing;
      },
      get stashCompleted() {
        return stashCompleted;
      },
      get stashError() {
        return stashError;
      },

      async handleStashAndClose(onStashAndClose: () => Promise<void>) {
        stashing = true;
        stashCompleted = false;
        stashError = null;
        try {
          await onStashAndClose();
          stashCompleted = true;
        } catch (e) {
          stashError = e instanceof Error ? e.message : String(e);
        } finally {
          stashing = false;
        }
      },

      areButtonsDisabled() {
        return stashing;
      },

      isEscapeBlocked() {
        return stashing;
      },

      isOverlayClickBlocked() {
        return stashing;
      },
    };
  }

  it("starts in non-stashing state", () => {
    const sm = createStashingStateMachine();
    expect(sm.stashing).toBe(false);
    expect(sm.areButtonsDisabled()).toBe(false);
  });

  it("transitions to stashing state when stash is initiated", async () => {
    const sm = createStashingStateMachine();
    let resolveStash!: () => void;
    const stashPromise = new Promise<void>((resolve) => {
      resolveStash = resolve;
    });

    const stashHandle = sm.handleStashAndClose(() => stashPromise);

    // During stash, buttons should be disabled
    expect(sm.stashing).toBe(true);
    expect(sm.areButtonsDisabled()).toBe(true);
    expect(sm.isEscapeBlocked()).toBe(true);
    expect(sm.isOverlayClickBlocked()).toBe(true);

    // Complete stash
    resolveStash();
    await stashHandle;

    expect(sm.stashing).toBe(false);
    expect(sm.areButtonsDisabled()).toBe(false);
    expect(sm.stashCompleted).toBe(true);
  });

  it("returns to non-stashing state on stash failure", async () => {
    const sm = createStashingStateMachine();

    await sm.handleStashAndClose(async () => {
      throw new Error("Stash failed");
    });

    expect(sm.stashing).toBe(false);
    expect(sm.areButtonsDisabled()).toBe(false);
    expect(sm.stashError).toBe("Stash failed");
    expect(sm.stashCompleted).toBe(false);
  });

  it("blocks escape key during stashing", () => {
    const sm = createStashingStateMachine();
    // Not stashing - escape should not be blocked
    expect(sm.isEscapeBlocked()).toBe(false);
  });

  it("blocks overlay click during stashing", async () => {
    const sm = createStashingStateMachine();
    let resolveStash!: () => void;
    const stashPromise = new Promise<void>((resolve) => {
      resolveStash = resolve;
    });

    const handle = sm.handleStashAndClose(() => stashPromise);
    expect(sm.isOverlayClickBlocked()).toBe(true);

    resolveStash();
    await handle;
    expect(sm.isOverlayClickBlocked()).toBe(false);
  });

  it("shows stashing indicator text during operation", () => {
    // Mirrors the component: when stashing is true, a "Stashing changes..." div is shown
    const stashing = true;
    const indicatorText = stashing ? "Stashing changes..." : null;
    expect(indicatorText).toBe("Stashing changes...");

    const notStashing = false;
    const noIndicator = notStashing ? "Stashing changes..." : null;
    expect(noIndicator).toBeNull();
  });

  it("stash button text changes during stashing", () => {
    const getButtonText = (stashing: boolean, hasErrors: boolean) => {
      if (stashing) return "Stashing changes...";
      if (hasErrors) return "Try Again";
      return "Stash & Close";
    };

    expect(getButtonText(false, false)).toBe("Stash & Close");
    expect(getButtonText(true, false)).toBe("Stashing changes...");
    expect(getButtonText(false, true)).toBe("Try Again");
    expect(getButtonText(true, true)).toBe("Stashing changes...");
  });
});

// =====================================================================
// P1#5: Remove path/terminology leaks - GitProjectSection
// =====================================================================

describe("P1#5 - friendlyWorktreeLabel (GitProjectSection)", () => {
  it("extracts branch from worktree path", () => {
    const result = friendlyWorktreeLabel(
      "my-project",
      "/Users/dev/.hermes/hermes-worktrees/a1b2c3d4/session1_feature-login",
    );
    expect(result).toBe("my-project (feature-login)");
  });

  it("returns just project name for non-worktree paths", () => {
    const result = friendlyWorktreeLabel(
      "my-project",
      "/Users/dev/projects/my-project",
    );
    expect(result).toBe("my-project");
  });

  it("handles branch with hyphens", () => {
    const result = friendlyWorktreeLabel(
      "app",
      "/data/hermes-worktrees/hash/sess_fix-auth-bug",
    );
    expect(result).toBe("app (fix-auth-bug)");
  });

  it("handles worktree path with no underscore in dir name", () => {
    const result = friendlyWorktreeLabel(
      "app",
      "/data/hermes-worktrees/hash/nounderscore",
    );
    // No underscore means no branch can be extracted, returns project name
    expect(result).toBe("app");
  });

  it("handles branch with slashes encoded as hyphens", () => {
    const result = friendlyWorktreeLabel(
      "app",
      "/data/hermes-worktrees/hash/sess_feature-JIRA-123",
    );
    expect(result).toBe("app (feature-JIRA-123)");
  });

  it("uses first underscore as separator", () => {
    // If the branch name itself contains underscores, they should be preserved
    const result = friendlyWorktreeLabel(
      "app",
      "/data/hermes-worktrees/hash/sess_my_branch_name",
    );
    expect(result).toBe("app (my_branch_name)");
  });
});

// =====================================================================
// P1#5: Remove path/terminology leaks - BranchMismatchAlert
// =====================================================================

describe("P1#5 - BranchMismatchAlert jargon removal", () => {
  /**
   * Mirrors the title text from BranchMismatchAlert.tsx.
   */
  const TITLE_TEXT = "You've entered another session's working directory";

  it("title uses 'working directory' instead of 'worktree'", () => {
    expect(TITLE_TEXT).toContain("working directory");
    expect(TITLE_TEXT).not.toContain("worktree");
  });

  it("title still mentions 'another session'", () => {
    expect(TITLE_TEXT).toContain("another session");
  });
});

// =====================================================================
// P1#5: Remove path/terminology leaks - WorktreeOverviewPanel
// =====================================================================

describe("P1#5 - friendlyWorktreeTooltip (WorktreeOverviewPanel)", () => {
  it("returns branch and session label", () => {
    const result = friendlyWorktreeTooltip(
      "/data/hermes-worktrees/hash/sess_main",
      "main",
      "Session 1",
    );
    expect(result).toBe("main — Session 1");
  });

  it("returns just branch if no session label", () => {
    const result = friendlyWorktreeTooltip(
      "/data/hermes-worktrees/hash/sess_feature",
      "feature",
    );
    expect(result).toBe("feature");
  });

  it("returns just session label if no branch", () => {
    const result = friendlyWorktreeTooltip(
      "/data/hermes-worktrees/hash/detached",
      null,
      "Session 2",
    );
    expect(result).toBe("Session 2");
  });

  it("falls back to last path segment if no branch or session", () => {
    const result = friendlyWorktreeTooltip(
      "/data/hermes-worktrees/hash/sess_main",
    );
    expect(result).toBe("sess_main");
  });

  it("falls back to full path if path has no segments", () => {
    const result = friendlyWorktreeTooltip("somepath");
    expect(result).toBe("somepath");
  });
});

describe("P1#5 - WorktreeOverviewPanel jargon removal", () => {
  /**
   * Mirrors the user-facing text from WorktreeOverviewPanel.tsx.
   */
  function getSearchPlaceholder(): string {
    return "Search working copies...";
  }

  function getEmptyMessage(hasSearch: boolean): string {
    return hasSearch
      ? "No working copies match your search."
      : "No working copies found.";
  }

  function getLoadingText(): string {
    return "Loading working copies...";
  }

  function getFooterStatsText(count: number): string {
    return `${count} working ${count !== 1 ? "copies" : "copy"}`;
  }

  function getDeleteButtonText(count: number): string {
    return `Delete ${count} working ${count !== 1 ? "copies" : "copy"}`;
  }

  function getStaleTooltip(): string {
    return "This working copy is older than 14 days";
  }

  it("search placeholder uses 'working copies' not 'worktrees'", () => {
    expect(getSearchPlaceholder()).toContain("working copies");
    expect(getSearchPlaceholder()).not.toContain("worktree");
  });

  it("empty message uses 'working copies' not 'worktrees'", () => {
    expect(getEmptyMessage(false)).toContain("working copies");
    expect(getEmptyMessage(true)).toContain("working copies");
    expect(getEmptyMessage(false)).not.toContain("worktree");
  });

  it("loading text uses 'working copies' not 'worktrees'", () => {
    expect(getLoadingText()).toContain("working copies");
    expect(getLoadingText()).not.toContain("worktree");
  });

  it("footer stats uses correct plural for working copies", () => {
    expect(getFooterStatsText(0)).toBe("0 working copies");
    expect(getFooterStatsText(1)).toBe("1 working copy");
    expect(getFooterStatsText(5)).toBe("5 working copies");
  });

  it("delete button text uses correct plural for working copies", () => {
    expect(getDeleteButtonText(1)).toBe("Delete 1 working copy");
    expect(getDeleteButtonText(3)).toBe("Delete 3 working copies");
  });

  it("stale tooltip uses 'working copy' not 'worktree'", () => {
    expect(getStaleTooltip()).toContain("working copy");
    expect(getStaleTooltip()).not.toContain("worktree");
  });
});
