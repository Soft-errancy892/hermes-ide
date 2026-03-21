import { useState, useEffect, useCallback, useRef } from "react";
import "../styles/components/DirtyWorktreeDialog.css";

export interface DirtyWorktreeChange {
  projectId: string;
  projectName: string;
  branchName: string | null;
  files: Array<{ path: string; status: string }>;
}

export interface StashError {
  projectName: string;
  error: string;
}

interface DirtyWorktreeDialogProps {
  sessionId: string;
  sessionLabel: string;
  changes: DirtyWorktreeChange[];
  stashErrors?: StashError[];
  onStashAndClose: () => Promise<void> | void;
  onCloseAnyway: () => void;
  onCancel: () => void;
}

function statusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "MODIFIED" || s === "M") return "M";
  if (s === "ADDED" || s === "A" || s === "NEW" || s === "UNTRACKED") return "A";
  if (s === "DELETED" || s === "D") return "D";
  if (s === "RENAMED" || s === "R") return "R";
  return s.charAt(0) || "?";
}

function statusClass(status: string): string {
  const label = statusLabel(status);
  switch (label) {
    case "M": return "dirty-wt-file-status--modified";
    case "A": return "dirty-wt-file-status--added";
    case "D": return "dirty-wt-file-status--deleted";
    default: return "dirty-wt-file-status--unknown";
  }
}

export function groupFilesByStatus(
  files: Array<{ path: string; status: string }>,
): { modified: number; added: number; deleted: number; other: number } {
  let modified = 0;
  let added = 0;
  let deleted = 0;
  let other = 0;
  for (const file of files) {
    const label = statusLabel(file.status);
    if (label === "M") modified++;
    else if (label === "A") added++;
    else if (label === "D") deleted++;
    else other++;
  }
  return { modified, added, deleted, other };
}

export function formatFileBreakdown(
  files: Array<{ path: string; status: string }>,
): string {
  const { modified, added, deleted, other } = groupFilesByStatus(files);
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} modified`);
  if (added > 0) parts.push(`${added} new`);
  if (deleted > 0) parts.push(`${deleted} deleted`);
  if (other > 0) parts.push(`${other} other`);
  return parts.join(", ");
}

export function DirtyWorktreeDialog({
  sessionLabel,
  changes,
  stashErrors,
  onStashAndClose,
  onCloseAnyway,
  onCancel,
}: DirtyWorktreeDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [stashing, setStashing] = useState(false);

  const handleStashAndClose = useCallback(async () => {
    setStashing(true);
    try {
      await onStashAndClose();
    } finally {
      setStashing(false);
    }
  }, [onStashAndClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (stashing) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }

    // Focus trapping within the dialog
    if (e.key === "Tab" && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [onCancel, stashing]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus the first button (Cancel) on mount
  useEffect(() => {
    if (modalRef.current) {
      const firstBtn = modalRef.current.querySelector<HTMLElement>("button");
      firstBtn?.focus();
    }
  }, []);

  const totalFiles = changes.reduce((sum, c) => sum + c.files.length, 0);
  const allFiles = changes.flatMap((c) => c.files);
  const breakdown = formatFileBreakdown(allFiles);

  return (
    <div className="dirty-wt-overlay" onClick={stashing ? undefined : onCancel}>
      <div
        className="dirty-wt-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dirty-wt-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="dirty-wt-header">
          <span className="dirty-wt-icon">&#9888;</span>
          <span className="dirty-wt-title" id="dirty-wt-dialog-title">Uncommitted Changes</span>
          <button className="dirty-wt-close" onClick={onCancel} disabled={stashing} aria-label="Close">&times;</button>
        </div>

        {/* Body */}
        <div className="dirty-wt-body">
          <p className="dirty-wt-message">
            Session <span className="dirty-wt-session-name">{sessionLabel}</span> has{" "}
            {totalFiles} uncommitted {totalFiles === 1 ? "change" : "changes"} ({breakdown}) across{" "}
            {changes.length} {changes.length === 1 ? "project" : "projects"}.
          </p>
          <p className="dirty-wt-warning">
            Closing this session will permanently delete its working directory and all uncommitted changes.
          </p>
          <p className="dirty-wt-stash-hint">
            Stashing saves your changes safely in the main repository. You can recover them later with <code>git stash pop</code>.
          </p>

          {changes.map((change) => (
            <div key={change.projectId} className="dirty-wt-project">
              <div className="dirty-wt-project-header">
                <span className="dirty-wt-project-name">{change.projectName}</span>
                {change.branchName && (
                  <span className="dirty-wt-branch-name">{change.branchName}</span>
                )}
                <span className="dirty-wt-file-breakdown">
                  {formatFileBreakdown(change.files)}
                </span>
              </div>
              <ul className="dirty-wt-file-list">
                {change.files.map((file) => (
                  <li key={file.path} className="dirty-wt-file-item">
                    <span className={`dirty-wt-file-status ${statusClass(file.status)}`}>
                      {statusLabel(file.status)}
                    </span>
                    <span className="dirty-wt-file-path">{file.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Stash Errors */}
        {stashErrors && stashErrors.length > 0 && (
          <div className="dirty-wt-errors">
            {stashErrors.map((err, i) => (
              <div key={i} className="dirty-wt-error-item">
                <span className="dirty-wt-error-label">Stash failed for {err.projectName}:</span>{" "}
                <span className="dirty-wt-error-message">{err.error}</span>
                <p className="dirty-wt-error-hint">Your changes are still in the working directory.</p>
              </div>
            ))}
          </div>
        )}

        {/* Stashing indicator */}
        {stashing && (
          <div className="dirty-wt-stashing" role="status">
            Stashing changes...
          </div>
        )}

        {/* Actions */}
        <div className="dirty-wt-actions">
          <button className="dirty-wt-btn" onClick={onCancel} disabled={stashing}>
            Cancel
          </button>
          {stashErrors && stashErrors.length > 0 ? (
            <>
              <button className="dirty-wt-btn dirty-wt-btn--close-anyway" onClick={onCloseAnyway} disabled={stashing}>
                Discard changes and close
              </button>
              <button className="dirty-wt-btn dirty-wt-btn--stash" onClick={handleStashAndClose} disabled={stashing}>
                {stashing ? "Stashing changes..." : "Try Again"}
              </button>
            </>
          ) : (
            <>
              <button className="dirty-wt-btn dirty-wt-btn--close-anyway" onClick={onCloseAnyway} disabled={stashing}>
                Discard changes and close
              </button>
              <button className="dirty-wt-btn dirty-wt-btn--stash" onClick={handleStashAndClose} disabled={stashing}>
                {stashing ? "Stashing changes..." : "Stash & Close"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
