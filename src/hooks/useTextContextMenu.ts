import { useCallback } from "react";
import { showContextMenu } from "../api/menu";
import { buildTextInputMenuItems } from "./useContextMenu";
import { ensureListener, registerContextMenuHandler, clearContextMenuHandler } from "./nativeMenuBridge";

// ─── Category B Hook — Text Input Context Menu ──────────────────────

export function useTextContextMenu(): {
  onContextMenu: (e: React.MouseEvent) => void;
} {
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const hasSelection = (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
    const items = buildTextInputMenuItems(hasSelection);

    ensureListener();
    registerContextMenuHandler((actionId: string) => {
      handleTextAction(actionId, target);
    });
    showContextMenu(items).then(() => {
      // Clear handler on menu dismiss (no item selected)
      clearContextMenuHandler();
    }).catch(() => {
      clearContextMenuHandler();
    });
  }, []);

  return { onContextMenu };
}

function handleTextAction(actionId: string, target: HTMLInputElement | HTMLTextAreaElement): void {
  if (!target.isConnected) return;
  target.focus();

  switch (actionId) {
    case "text.cut": {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      if (start !== end) {
        const selectedText = target.value.slice(start, end);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(selectedText).then(() => {
            // Clear the selected text after copying
            const before = target.value.slice(0, start);
            const after = target.value.slice(end);
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, "value"
            )?.set || Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, "value"
            )?.set;
            nativeInputValueSetter?.call(target, before + after);
            target.selectionStart = target.selectionEnd = start;
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }).catch(() => {
            // Fallback to deprecated API for older WebKit
            document.execCommand("cut");
          });
        } else {
          document.execCommand("cut");
        }
      }
      break;
    }
    case "text.copy": {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      if (start !== end) {
        const selectedText = target.value.slice(start, end);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(selectedText).catch(() => {
            // Fallback to deprecated API for older WebKit
            document.execCommand("copy");
          });
        } else {
          document.execCommand("copy");
        }
      }
      break;
    }
    case "text.paste":
      // Tauri handles native paste via the menu accelerator
      document.execCommand("paste");
      break;
    case "text.select-all":
      target.select();
      break;
  }
}
