import type { Terminal } from "@xterm/xterm";

// ─── Ghost Text (Command Predictions) ───────────────────────────────

/**
 * Ghost text overlay rendering logic and suggestion display.
 * Operates on a terminal entry's ghost state.
 */

export interface GhostTextEntry {
  terminal: Terminal;
  container: HTMLDivElement;
  attached: boolean;
  opened: boolean;
  ghostText: string | null;
  ghostOverlay: HTMLDivElement | null;
}

export function renderGhostText(entry: GhostTextEntry, text: string): void {
  if (!entry.attached || !entry.opened) return;

  clearGhostOverlay(entry);
  entry.ghostText = text;

  // Read actual terminal font settings for accurate sizing
  const opts = entry.terminal.options;
  const fontSize = opts.fontSize || 14;
  const fontFamily = opts.fontFamily || "monospace";
  const lineHeight = opts.lineHeight || 1.2;

  // Create overlay element positioned at cursor
  const overlay = document.createElement("div");
  overlay.className = "ghost-text-overlay";
  overlay.textContent = text;
  overlay.style.cssText = `
    position: absolute;
    color: var(--text-3);
    opacity: 0.4;
    pointer-events: none;
    font-family: ${fontFamily};
    font-size: ${fontSize}px;
    line-height: ${lineHeight};
    white-space: pre;
    z-index: 5;
  `;

  // Position relative to cursor using xterm's internal cell dimensions
  try {
    const term = entry.terminal as any;
    const dims = term._core?._renderService?.dimensions;
    if (dims) {
      const cellW = dims.css?.cell?.width ?? dims.actualCellWidth ?? (fontSize * 0.6);
      const cellH = dims.css?.cell?.height ?? dims.actualCellHeight ?? (fontSize * lineHeight);
      const cursorX = entry.terminal.buffer.active.cursorX;
      const cursorY = entry.terminal.buffer.active.cursorY;
      overlay.style.left = `${cursorX * cellW}px`;
      overlay.style.top = `${cursorY * cellH}px`;
    }
  } catch {
    // Fallback — position at bottom-left
    overlay.style.bottom = "0";
    overlay.style.left = "0";
  }

  // Append to xterm-screen which has the correct coordinate space
  const xtermEl = entry.container.querySelector(".xterm-screen");
  if (xtermEl) {
    (xtermEl as HTMLElement).style.position = "relative";
    xtermEl.appendChild(overlay);
    entry.ghostOverlay = overlay;
  }
}

export function clearGhostOverlay(entry: GhostTextEntry): void {
  entry.ghostText = null;
  if (entry.ghostOverlay) {
    entry.ghostOverlay.remove();
    entry.ghostOverlay = null;
  }
}
