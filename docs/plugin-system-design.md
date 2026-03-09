# Hermes IDE Plugin System -- Technical Design Document

**Version:** 0.1 (Draft)
**Date:** 2026-03-09
**Status:** Design Phase -- No implementation yet

---

## Table of Contents

1. [Design Goals and Constraints](#1-design-goals-and-constraints)
2. [Architecture Overview](#2-architecture-overview)
3. [Plugin Manifest Format](#3-plugin-manifest-format)
4. [Plugin API Surface](#4-plugin-api-surface)
5. [UI Integration Points (Slots)](#5-ui-integration-points-slots)
6. [Plugin Lifecycle](#6-plugin-lifecycle)
7. [Security Model](#7-security-model)
8. [Distribution and Marketplace](#8-distribution-and-marketplace)
9. [Developer Experience](#9-developer-experience)
10. [Migration Path: Extracting Built-in Features](#10-migration-path-extracting-built-in-features)
11. [Concrete Example: JSON Formatter Plugin](#11-concrete-example-json-formatter-plugin)
12. [Implementation Phases](#12-implementation-phases)

---

## 1. Design Goals and Constraints

### Goals

- **Safe by default** -- Plugins must not be able to crash the app, access arbitrary filesystem paths, or make network requests without explicit user permission.
- **Easy to develop** -- A developer should go from zero to a working plugin in under 30 minutes. The plugin API should feel natural to anyone who knows React and TypeScript.
- **Enjoyable to use** -- Plugin UI must feel native. No iframe borders, no loading spinners for local plugins, no jank.
- **Incrementally adoptable** -- Built-in features (Git panel, Process panel, Search panel) should be architecturally similar to plugins so they can eventually be extracted, but extraction is not a prerequisite for launching the plugin system.
- **Cross-platform** -- Plugins must work on macOS, Windows, and Linux without platform-specific code (unless the plugin explicitly opts in).

### Constraints

- Hermes IDE is a Tauri 2 app. The frontend runs in a system webview (WKWebView, WebView2, WebKitGTK), not Chromium. This rules out Chrome extension APIs and Electron-specific patterns.
- The state management is a single `useReducer` in `SessionContext`. Plugins must interact with it through a controlled API, never by dispatching raw actions.
- Terminal rendering uses a module-level pool (`TerminalPool.ts`). Plugin access to terminal content must go through the Rust backend, not by directly touching xterm.js instances.
- The app currently has ~50 flat components and no module federation or dynamic imports beyond standard code splitting. The plugin system must introduce dynamic loading without disrupting the existing bundle.

---

## 2. Architecture Overview

```
                        Plugin Ecosystem
                        ================

  ┌─────────────────────────────────────────────────────────────────┐
  │                      Hermes IDE Host App                        │
  │                                                                 │
  │  ┌────────────────────────────────────────────────────────────┐ │
  │  │                    Plugin Runtime                          │ │
  │  │                                                            │ │
  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │ │
  │  │  │ Plugin Loader │  │ Plugin Store │  │  Sandbox       │  │ │
  │  │  │ (manifest     │  │ (registry,   │  │  (permission   │  │ │
  │  │  │  validation,  │  │  state,      │  │   enforcement, │  │ │
  │  │  │  dynamic      │  │  lifecycle)  │  │   API proxy)   │  │ │
  │  │  │  import)      │  │              │  │                │  │ │
  │  │  └──────────────┘  └──────────────┘  └────────────────┘  │ │
  │  │                                                            │ │
  │  │  ┌────────────────────────────────────────────────────┐   │ │
  │  │  │              hermes Plugin API                     │   │ │
  │  │  │                                                    │   │ │
  │  │  │  ui.registerPanel()     commands.register()        │   │ │
  │  │  │  ui.registerSidebarIcon()  statusBar.addItem()     │   │ │
  │  │  │  sessions.getActive()   storage.get() / .set()     │   │ │
  │  │  │  clipboard.read/write() terminal.onOutput()        │   │ │
  │  │  └────────────────────────────────────────────────────┘   │ │
  │  └────────────────────────────────────────────────────────────┘ │
  │                                                                 │
  │  ┌───────────────────────────────────────┐                     │
  │  │         UI Slot System                │                     │
  │  │                                       │                     │
  │  │  ActivityBar  │ SidePanel │ StatusBar  │                     │
  │  │  slots        │ slots    │ slots      │                     │
  │  │               │          │            │                     │
  │  │  CommandPalette entries               │                     │
  │  │  Modal/Overlay mounting               │                     │
  │  └───────────────────────────────────────┘                     │
  │                                                                 │
  ├─────────── Tauri IPC Bridge ────────────────────────────────────┤
  │                                                                 │
  │  ┌────────────────────────────────────────────────────────────┐ │
  │  │                  Rust Backend                              │ │
  │  │                                                            │ │
  │  │  ┌────────────────────────────────────┐                   │ │
  │  │  │  Plugin Backend Module             │                   │ │
  │  │  │  - Plugin storage (SQLite)         │                   │ │
  │  │  │  - Permission checking             │                   │ │
  │  │  │  - Plugin file management          │                   │ │
  │  │  └────────────────────────────────────┘                   │ │
  │  └────────────────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────┘

  External:
  ┌────────────────────────────────────┐
  │  hermes-hq/plugins (GitHub repo)   │
  │  - Plugin registry (index.json)    │
  │  - Published plugin packages       │
  │  - Review pipeline                 │
  └────────────────────────────────────┘
```

### Key Design Decision: In-Process React Components, Not Iframes

Plugins will be loaded as **ES modules that export React components**, rendered in-process within the host app's React tree. This is chosen over iframe-based isolation because:

1. **Performance** -- No cross-frame serialization overhead. Plugin UI renders at native React speed.
2. **Theming** -- Plugins inherit CSS custom properties from the host app's theme system. A plugin rendered under the `tron` theme automatically gets tron colors.
3. **DX** -- Developers can use standard React patterns, hooks, and the host's design tokens. No postMessage/JSON API.
4. **Consistency** -- Plugin panels look and feel identical to built-in panels.

The trade-off is weaker isolation. This is mitigated by the permission system (Section 7) and the controlled API surface (Section 4). Plugins cannot import host internals directly -- they receive a sandboxed API object.

---

## 3. Plugin Manifest Format

Every plugin has a `hermes-plugin.json` file at its root. This is the single source of truth for metadata, contributions, and permissions.

### Schema

```jsonc
{
  // ─── Identity ────────────────────────────────────────────────
  "id": "hermes-hq.json-formatter",          // Unique ID: scope.name
  "name": "JSON Formatter",                   // Display name
  "version": "1.0.0",                         // Semver
  "description": "Format, minify, and validate JSON in a side panel.",
  "author": {
    "name": "Hermes HQ",
    "url": "https://hermes-ide.com"
  },
  "license": "Apache-2.0",
  "repository": "https://github.com/hermes-hq/plugins",
  "icon": "./icon.svg",                       // 18x18 SVG icon

  // ─── Compatibility ──────────────────────────────────────────
  "engines": {
    "hermes": ">=0.4.0"                       // Min IDE version (semver range)
  },

  // ─── Entry Point ────────────────────────────────────────────
  "main": "./dist/index.js",                  // ES module entry (after build)
  "source": "./src/index.tsx",                // Source entry (for dev mode)

  // ─── UI Contributions ───────────────────────────────────────
  "contributes": {

    // Sidebar icons (ActivityBar)
    "sidebarIcons": [
      {
        "id": "json-formatter",
        "icon": "./icon.svg",                 // Or inline SVG string
        "tooltip": "JSON Formatter",
        "side": "left",                        // "left" | "right"
        "position": "top"                      // "top" | "bottom"
      }
    ],

    // Panels (shown in sidebar area or right-side panel area)
    "panels": [
      {
        "id": "json-formatter-panel",
        "title": "JSON Formatter",
        "icon": "./icon.svg",
        "location": "left",                    // "left" | "right" | "bottom"
        "activationEvent": "sidebarIcon:json-formatter",
        "component": "JsonFormatterPanel"       // Named export from main entry
      }
    ],

    // Command Palette commands
    "commands": [
      {
        "id": "json-formatter.format",
        "title": "Format JSON",
        "category": "JSON",
        "shortcut": null                       // Optional keyboard shortcut
      },
      {
        "id": "json-formatter.minify",
        "title": "Minify JSON",
        "category": "JSON"
      },
      {
        "id": "json-formatter.validate",
        "title": "Validate JSON",
        "category": "JSON"
      }
    ],

    // Status bar items
    "statusBarItems": [
      {
        "id": "json-formatter.status",
        "text": "JSON",                        // Static text or dynamic via API
        "tooltip": "JSON Formatter active",
        "alignment": "right",                   // "left" | "right"
        "priority": 50,                         // Lower = further from edge
        "command": "json-formatter.format"      // Click action
      }
    ]
  },

  // ─── Permissions ────────────────────────────────────────────
  "permissions": [
    "clipboard.read",
    "clipboard.write",
    "storage"
  ]
}
```

### Manifest Fields Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Globally unique identifier in `scope.name` format. Official plugins use `hermes-hq.*`. Community plugins use their GitHub username/org. |
| `name` | Yes | Human-readable display name. |
| `version` | Yes | Semver version string. |
| `description` | Yes | One-line description shown in marketplace. |
| `author` | Yes | Object with `name` and optional `url`. |
| `license` | Yes | SPDX license identifier. |
| `engines.hermes` | Yes | Semver range of compatible Hermes IDE versions. |
| `main` | Yes | Path to the built ES module entry point (relative to plugin root). |
| `source` | No | Path to source entry point. Used for dev-mode hot reload. |
| `contributes` | No | Declarative UI contribution points. |
| `permissions` | No | Array of permission strings the plugin needs. Defaults to none. |
| `icon` | No | Path to an SVG icon file. Used in the marketplace and settings. |

### Validation

The host app validates the manifest at install time and at load time:
- `id` must match `^[a-z0-9-]+\.[a-z0-9-]+$`
- `version` must be valid semver
- `engines.hermes` must be satisfied by the current IDE version
- `main` must point to an existing file
- `contributes` entries are validated against the known slot types
- `permissions` are validated against the known permission set

---

## 4. Plugin API Surface

Plugins receive a `hermes` API object when their `activate` function is called. This object is the only way plugins interact with the host. Plugins **cannot** import from `@tauri-apps/api`, `react`, or any host module directly -- these are provided by the host as shared dependencies.

### API Namespace Structure

```typescript
interface HermesPluginAPI {
  // ─── UI ──────────────────────────────────────────────────────
  ui: {
    /** Register a React component as a panel. */
    registerPanel(panelId: string, component: React.ComponentType): void;

    /** Show/hide a panel programmatically. */
    showPanel(panelId: string): void;
    hidePanel(panelId: string): void;
    togglePanel(panelId: string): void;

    /** Update a status bar item's text/tooltip dynamically. */
    updateStatusBarItem(itemId: string, update: {
      text?: string;
      tooltip?: string;
      visible?: boolean;
    }): void;

    /** Show a toast notification in the app. */
    showToast(message: string, options?: {
      type?: "info" | "success" | "warning" | "error";
      duration?: number;   // ms, default 3000
    }): void;

    /** Show a modal dialog. Returns user's choice. */
    showModal(options: {
      title: string;
      body: string | React.ReactNode;
      buttons?: { label: string; value: string; primary?: boolean }[];
    }): Promise<string | null>;

    /** Get the current theme info. */
    getTheme(): { id: string; isDark: boolean; accentColor: string };

    /** Subscribe to theme changes. */
    onThemeChange(callback: (theme: { id: string; isDark: boolean; accentColor: string }) => void): Disposable;
  };

  // ─── Commands ────────────────────────────────────────────────
  commands: {
    /** Register a command handler. */
    register(commandId: string, handler: () => void | Promise<void>): Disposable;

    /** Execute a registered command. */
    execute(commandId: string): Promise<void>;
  };

  // ─── Sessions ────────────────────────────────────────────────
  sessions: {
    /** Get the active session's metadata. */
    getActive(): SessionInfo | null;

    /** Get all sessions. */
    getAll(): SessionInfo[];

    /** Subscribe to active session changes. */
    onActiveSessionChange(callback: (session: SessionInfo | null) => void): Disposable;

    /** Subscribe to session lifecycle events. */
    onSessionEvent(event: "created" | "updated" | "removed", callback: (session: SessionInfo) => void): Disposable;
  };

  // ─── Terminal (requires "terminal.read" or "terminal.write" permission) ─
  terminal: {
    /** Subscribe to terminal output for a session. Read-only. */
    onOutput(sessionId: string, callback: (data: string) => void): Disposable;

    /** Write text to a session's terminal. */
    writeToSession(sessionId: string, data: string): Promise<void>;

    /** Get the current working directory of a session. */
    getCwd(sessionId: string): Promise<string>;
  };

  // ─── Clipboard (requires "clipboard.read" / "clipboard.write" permission) ─
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };

  // ─── Storage (requires "storage" permission) ──────────────────
  storage: {
    /** Per-plugin key-value storage. Persisted across sessions. */
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    getAll(): Promise<Record<string, string>>;
  };

  // ─── Notifications ───────────────────────────────────────────
  notifications: {
    /** Send a system notification. */
    send(title: string, body?: string): Promise<void>;
  };

  // ─── Context (read-only access to project info) ──────────────
  context: {
    /** Get attached projects for the active session. */
    getProjects(): Promise<ProjectInfo[]>;

    /** Get the git status for the active session. */
    getGitSummary(): Promise<{ branch: string | null; changeCount: number } | null>;
  };

  // ─── Lifecycle ───────────────────────────────────────────────
  /** Disposable pattern for cleanup. */
  subscriptions: Disposable[];
}

interface Disposable {
  dispose(): void;
}

interface SessionInfo {
  id: string;
  label: string;
  color: string;
  phase: string;
  workingDirectory: string;
  detectedAgent: { name: string; model: string | null } | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  languages: string[];
}
```

### What Plugins Cannot Access

- **Direct state dispatch** -- No dispatching raw `SessionAction` objects. All mutations go through the API.
- **Terminal instances** -- No direct access to xterm.js `Terminal` objects or the `TerminalPool`.
- **Database** -- No raw SQLite access. Only the `storage` API for per-plugin data.
- **Filesystem** -- No general filesystem read/write. Plugins that need file access must go through a file picker dialog (future permission).
- **Network** -- No arbitrary network requests without a `network` permission (future).
- **Other plugins' storage** -- Each plugin's storage is namespaced by its ID.
- **Tauri IPC** -- Plugins cannot call `invoke()` directly. Backend access is mediated by the host.

### Shared Dependencies

The host app provides these as shared modules so plugins don't bundle them:

- `react` (18.x)
- `react-dom` (18.x)

Plugins declare these as `peerDependencies` in their `package.json` and the build tool externalizes them.

---

## 5. UI Integration Points (Slots)

The host app renders plugin UI through a **slot system**. Each slot is a mount point in the app layout where plugin components can appear.

### 5.1 ActivityBar (Sidebar Icons)

**Current state:** `ActivityBar` receives a `tabs` array of `{ id, label, icon, badge }` and renders them as icon buttons. The left bar has Sessions and the right bar has Context.

**Plugin integration:** The `PluginRuntime` collects all `contributes.sidebarIcons` from loaded plugins and merges them with built-in tabs before passing to `ActivityBar`.

```
Left ActivityBar:
  ┌─────┐
  │  +  │  ← topAction (built-in: New Session)
  ├─────┤
  │ 📋  │  ← built-in: Sessions
  │ { } │  ← PLUGIN: JSON Formatter
  │ 🔧  │  ← PLUGIN: Some other plugin
  ├─────┤
  │  ⚙  │  ← bottomAction (built-in: Settings)
  └─────┘

Right ActivityBar:
  ┌─────┐
  │ ℹ️  │  ← built-in: Context
  │ 📊  │  ← PLUGIN: Analytics plugin
  └─────┘
```

**How it works:**

1. Plugin declares a `sidebarIcons` entry in its manifest.
2. At load time, the `PluginRuntime` reads the SVG icon (from file path or inline string).
3. The host's `App.tsx` reads plugin sidebar contributions from the `PluginRuntime` and includes them in the `tabs` array passed to `ActivityBar`.
4. When a plugin sidebar icon is clicked, the host dispatches an internal action that activates the plugin's associated panel.

**Icon format:** Plugins provide an 18x18 SVG that uses `currentColor` for the stroke/fill. The host injects it via `dangerouslySetInnerHTML` after sanitization (strip script tags, event handlers).

### 5.2 Side Panels

**Current state:** Panels render in the sidebar area (left) or the right-side area. Examples: `SessionList`, `GitPanel`, `ProcessPanel`, `FileExplorerPanel`, `SearchPanel` (left side); `ContextPanel` (right side). They are conditionally rendered based on `ui.*` boolean flags in the reducer state.

**Plugin integration:** Plugin panels render in the same sidebar slots. The host manages activation/deactivation.

```typescript
// In the host's App.tsx render, after built-in panels:

{pluginRuntime.getActivePanels("left").map(panel => (
  <PanelErrorBoundary key={panel.id} panelName={panel.title}>
    <PluginPanelHost
      pluginId={panel.pluginId}
      panelId={panel.id}
      component={panel.component}
    />
  </PanelErrorBoundary>
))}
```

The `PluginPanelHost` wrapper provides:
- Error boundary isolation (a crashing plugin panel does not take down the app)
- CSS scoping (plugin panel gets a container with `data-plugin-id` attribute for style isolation)
- Size constraints (panels respect the same min/max width as built-in panels)
- The `hermes` API object passed via React context

**Panel locations:**
- `"left"` -- Renders in the left sidebar area, same position as Git/Process/Files/Search panels. Only one left-side panel is visible at a time (same rule as built-in panels).
- `"right"` -- Renders in the right-side area, same position as Context Panel. Can coexist with the Context Panel (stacked vertically) or replace it.
- `"bottom"` -- Future slot. Below the terminal area, similar to VS Code's panel area.

### 5.3 Command Palette

**Current state:** `CommandPalette` has a hardcoded `commands` array built from props callbacks. Each command has `{ id, label, category, shortcut, action }`.

**Plugin integration:** The host merges plugin-contributed commands into the palette's command list.

```typescript
// Plugin manifest declares commands:
"commands": [
  {
    "id": "json-formatter.format",
    "title": "Format JSON",
    "category": "JSON"
  }
]

// Plugin activate() registers handlers:
hermes.commands.register("json-formatter.format", () => {
  // Format the JSON in the panel
});
```

When the user opens the Command Palette and types "format json", the plugin's command appears alongside built-in commands. Executing it calls the registered handler.

**Command ID namespacing:** All plugin commands are namespaced by their plugin ID prefix (e.g., `json-formatter.format`). This prevents collisions.

### 5.4 Status Bar

**Current state:** `StatusBar` renders a left section (session count, mode, agent info) and a right section (tokens, cost, cwd, version, theme picker, bug report, shortcuts).

**Plugin integration:** Plugins declare status bar items in their manifest and can update them dynamically.

```
Status Bar:
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ● 3 active │ Assisted │ Claude (Opus)  ···  JSON ✓ │ v0.4.0 │ ⚙ │
  │  built-in  │ built-in │    built-in     PLUGIN^     built-in       │
  └──────────────────────────────────────────────────────────────────────┘
```

Plugin status bar items are rendered in a dedicated zone (between built-in right-side items), ordered by their `priority` value. Clicking an item executes its associated command.

```typescript
// Dynamic update from plugin code:
hermes.ui.updateStatusBarItem("json-formatter.status", {
  text: "JSON Valid",
  tooltip: "Last validated: 2 seconds ago"
});
```

### 5.5 Modals and Overlays

Plugins can show modal dialogs through the API. They cannot render arbitrary overlays or portals.

```typescript
// Simple confirmation dialog
const result = await hermes.ui.showModal({
  title: "Replace Content?",
  body: "This will replace the current editor content with formatted JSON.",
  buttons: [
    { label: "Cancel", value: "cancel" },
    { label: "Replace", value: "replace", primary: true }
  ]
});
if (result === "replace") { /* ... */ }
```

For more complex UI, plugins should use their panel. Modals are intentionally limited to prevent plugins from creating intrusive popup experiences.

---

## 6. Plugin Lifecycle

### 6.1 Installation

Plugins can be installed from three sources:

**A. Marketplace (hermes-hq/plugins repo)**
1. User opens Settings > Plugins (or Command Palette: "Install Plugin").
2. The app fetches the plugin index from `https://raw.githubusercontent.com/hermes-hq/plugins/main/registry/index.json`.
3. User browses/searches and clicks "Install".
4. The app downloads the plugin's release tarball (`.tgz`) from the registry.
5. The tarball is extracted to `{app_data_dir}/plugins/{plugin-id}/`.
6. The manifest is validated.
7. The plugin appears in Settings > Plugins as "Installed (inactive)".

**B. Local directory (development)**
1. User opens Settings > Plugins and clicks "Install from folder..." (or runs `hermes plugin install /path/to/plugin` from terminal).
2. The app creates a symlink from `{app_data_dir}/plugins/{plugin-id}` to the local directory.
3. The manifest is validated.
4. In dev mode, file watchers enable hot reload.

**C. Direct URL**
1. User provides a URL to a `.tgz` file.
2. Same flow as marketplace install.

### 6.2 Loading at Startup

```
App starts
    │
    ▼
PluginRuntime.initialize()
    │
    ├─ Scan {app_data_dir}/plugins/ for directories with hermes-plugin.json
    │
    ├─ For each plugin:
    │   ├─ Parse and validate hermes-plugin.json
    │   ├─ Check engines.hermes compatibility
    │   ├─ Check if plugin is enabled (stored in settings table)
    │   ├─ If disabled, skip (but keep in registry for Settings UI)
    │   └─ Add to loading queue
    │
    ├─ Sort by dependency order (future: inter-plugin dependencies)
    │
    └─ For each enabled plugin:
        ├─ Dynamic import(main) to load the ES module
        ├─ Resolve contributes (register sidebar icons, commands, panels, status bar items)
        ├─ Create sandboxed API object with permission checks
        ├─ Call plugin's activate(hermes) function
        └─ Mark as "active" in registry
```

### 6.3 Activation and Deactivation

Each plugin's entry point must export an `activate` function and optionally a `deactivate` function:

```typescript
// Plugin entry point (src/index.tsx)
import type { HermesPluginAPI } from "@hermes-ide/plugin-api";

export function activate(hermes: HermesPluginAPI) {
  // Register command handlers, set up subscriptions, etc.
  // Return value is ignored.
}

export function deactivate() {
  // Optional cleanup. Called when plugin is disabled or app closes.
  // The host also auto-disposes all subscriptions in hermes.subscriptions.
}
```

**Activation triggers:**
- At startup, if the plugin is enabled.
- When the user enables a disabled plugin in Settings > Plugins.

**Deactivation triggers:**
- When the user disables the plugin in Settings > Plugins.
- When the app is shutting down.
- When the plugin is uninstalled.

On deactivation:
1. The host calls `deactivate()` if exported.
2. All `Disposable` objects in `hermes.subscriptions` are disposed.
3. All registered panels, commands, sidebar icons, and status bar items are removed.
4. The plugin's status is set to "inactive" in the registry.

### 6.4 Updates

1. The app periodically checks the registry index for version updates (configurable interval, default: daily).
2. If an update is available, the user sees a badge in Settings > Plugins.
3. The user clicks "Update". The app downloads the new version, deactivates the old one, replaces the files, and activates the new one.
4. If the new version's `engines.hermes` is incompatible with the current IDE version, the update is shown but not applied until the IDE is updated.

### 6.5 Uninstallation

1. User clicks "Uninstall" in Settings > Plugins.
2. Plugin is deactivated.
3. The plugin directory (or symlink) is deleted from `{app_data_dir}/plugins/`.
4. Plugin storage data is optionally deleted (user is asked).
5. Plugin is removed from the registry.

---

## 7. Security Model

### 7.1 Permission System

Plugins declare the permissions they need in their manifest. Users see these permissions before enabling a plugin and can revoke them later.

**Permission levels:**

| Permission | Grants | Risk Level |
|-----------|--------|------------|
| *(none)* | UI rendering, commands, theme info | None |
| `clipboard.read` | Read system clipboard text | Low |
| `clipboard.write` | Write to system clipboard | Low |
| `storage` | Per-plugin persistent key-value storage | Low |
| `terminal.read` | Subscribe to terminal output (raw text) for any session | Medium |
| `terminal.write` | Write text to terminal sessions | High |
| `notifications` | Send system notifications | Low |
| `sessions.read` | Read session metadata (label, cwd, agent info) | Low |
| `network` | Make HTTP requests to specified domains (future) | High |
| `filesystem.read` | Read files through a scoped dialog (future) | High |

**Default (no permissions declared):** A plugin can render UI, register commands, use the theme, and show toasts. It cannot access the clipboard, terminal, sessions, storage, or anything else.

### 7.2 Enforcement

The `hermes` API object passed to each plugin is a **Proxy** that checks permissions before each API call:

```typescript
// Simplified internal implementation:
function createPluginAPI(pluginId: string, grantedPermissions: Set<string>): HermesPluginAPI {
  return {
    clipboard: {
      readText() {
        if (!grantedPermissions.has("clipboard.read")) {
          throw new PermissionDeniedError(pluginId, "clipboard.read");
        }
        return navigator.clipboard.readText();
      },
      writeText(text: string) {
        if (!grantedPermissions.has("clipboard.write")) {
          throw new PermissionDeniedError(pluginId, "clipboard.write");
        }
        return navigator.clipboard.writeText(text);
      }
    },
    // ... other namespaces with similar checks
  };
}
```

### 7.3 Error Isolation

- Each plugin panel is wrapped in a `PanelErrorBoundary` (already used for built-in panels). If a plugin throws, the panel shows an error state instead of crashing the app.
- Plugin `activate()` calls are wrapped in try-catch. A failing plugin is marked as "errored" and can be retried or disabled.
- Plugin command handlers are wrapped in try-catch. Errors are logged and shown as toast notifications.

### 7.4 What Plugins Cannot Do

- Access `window.__TAURI__` or `invoke()` directly (the host does not expose these to plugin modules).
- Import from host-internal paths (`../state/SessionContext`, `../terminal/TerminalPool`, etc.).
- Modify the DOM outside their panel container.
- Register global keyboard shortcuts that override built-in ones.
- Access other plugins' storage or API objects.

### 7.5 Plugin Review (Marketplace)

Plugins submitted to the `hermes-hq/plugins` registry go through a review process:
1. Automated checks: manifest validation, dependency audit, bundle size limits.
2. Manual review for high-permission plugins (`terminal.write`, `network`, `filesystem`).
3. Code signing (future): official plugins are signed with a Hermes key.

---

## 8. Distribution and Marketplace

### 8.1 Registry Structure (hermes-hq/plugins repo)

```
hermes-hq/plugins/
├── registry/
│   ├── index.json                    # Plugin index (list of all plugins)
│   └── plugins/
│       ├── hermes-hq.json-formatter/
│       │   ├── metadata.json         # Full manifest + download URL
│       │   └── versions/
│       │       ├── 1.0.0.json        # Version-specific metadata
│       │       └── 1.1.0.json
│       └── hermes-hq.markdown-preview/
│           ├── metadata.json
│           └── versions/
│               └── 1.0.0.json
├── plugins/                          # Plugin source code (monorepo)
│   ├── json-formatter/
│   │   ├── hermes-plugin.json
│   │   ├── package.json
│   │   ├── src/
│   │   └── dist/
│   └── markdown-preview/
│       ├── hermes-plugin.json
│       ├── package.json
│       ├── src/
│       └── dist/
└── .github/
    └── workflows/
        └── publish-plugin.yml        # CI: build, validate, publish
```

### 8.2 Registry Index Format

```jsonc
// registry/index.json
{
  "version": 1,
  "plugins": [
    {
      "id": "hermes-hq.json-formatter",
      "name": "JSON Formatter",
      "description": "Format, minify, and validate JSON in a side panel.",
      "author": "Hermes HQ",
      "latestVersion": "1.0.0",
      "minHermesVersion": "0.4.0",
      "downloads": 1200,
      "rating": 4.8,
      "tags": ["json", "formatter", "tools"],
      "icon": "https://raw.githubusercontent.com/hermes-hq/plugins/main/plugins/json-formatter/icon.svg",
      "updatedAt": "2026-03-01T00:00:00Z"
    }
  ]
}
```

### 8.3 Discovery Flow

1. User opens Settings > Plugins > Browse.
2. App fetches `index.json` from the registry (cached for 1 hour).
3. User sees a searchable/filterable list of plugins with icons, descriptions, download counts, and ratings.
4. User clicks a plugin to see its full description, screenshots, permissions, and changelog.
5. User clicks "Install". App downloads the tarball from the version-specific metadata URL.

### 8.4 Versioning

- Plugins use semver.
- The registry stores all published versions.
- Users can pin a version or auto-update.
- Breaking IDE API changes bump the major version of `engines.hermes`.

---

## 9. Developer Experience

### 9.1 Project Structure (Minimal Plugin)

```
my-plugin/
├── hermes-plugin.json      # Manifest
├── package.json            # npm dependencies + build scripts
├── tsconfig.json           # TypeScript config
├── src/
│   └── index.tsx           # Entry point with activate/deactivate
├── icon.svg                # Plugin icon (18x18)
└── dist/                   # Built output (gitignored)
    └── index.js
```

### 9.2 Hello World Plugin

```typescript
// src/index.tsx
import type { HermesPluginAPI } from "@hermes-ide/plugin-api";

export function activate(hermes: HermesPluginAPI) {
  // Register a command
  const cmd = hermes.commands.register("hello-world.greet", () => {
    hermes.ui.showToast("Hello from my first plugin!", { type: "success" });
  });
  hermes.subscriptions.push(cmd);
}

export function deactivate() {
  // Nothing to clean up -- subscriptions auto-disposed by host
}
```

```jsonc
// hermes-plugin.json
{
  "id": "my-username.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A minimal plugin that says hello.",
  "author": { "name": "My Name" },
  "license": "MIT",
  "engines": { "hermes": ">=0.4.0" },
  "main": "./dist/index.js",
  "contributes": {
    "commands": [
      {
        "id": "hello-world.greet",
        "title": "Say Hello",
        "category": "Hello"
      }
    ]
  },
  "permissions": []
}
```

### 9.3 CLI Tooling

A `@hermes-ide/create-plugin` scaffolder:

```bash
npx @hermes-ide/create-plugin my-plugin
# Creates the directory structure, manifest, tsconfig, build config

cd my-plugin
npm install
npm run dev        # Starts the dev server with hot reload
```

A `@hermes-ide/plugin-cli` for development:

```bash
hermes-plugin dev          # Watch mode + hot reload into running IDE
hermes-plugin build        # Production build (bundle + minify)
hermes-plugin validate     # Validate manifest and permissions
hermes-plugin package      # Create .tgz for distribution
hermes-plugin publish      # Submit to the registry (requires auth)
```

### 9.4 Dev Mode and Hot Reload

When developing locally:

1. The developer runs `hermes-plugin dev` in their plugin directory.
2. This starts a local file watcher that rebuilds on change.
3. In Hermes IDE, the developer installs the plugin from the local directory (symlink).
4. The `PluginRuntime` detects file changes on the symlinked plugin and:
   a. Calls `deactivate()` on the current version.
   b. Invalidates the module cache.
   c. Re-imports the module.
   d. Calls `activate()` on the new version.
5. The plugin panel hot-reloads without restarting the app.

### 9.5 Type Definitions

The `@hermes-ide/plugin-api` package provides TypeScript type definitions for the `HermesPluginAPI` interface. This is a types-only package (no runtime code) that plugins install as a dev dependency.

```json
// Plugin's package.json
{
  "devDependencies": {
    "@hermes-ide/plugin-api": "^0.4.0",
    "typescript": "^5.6.0"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

### 9.6 Build Configuration

Plugins are built with Vite (recommended) or any bundler that outputs ES modules. The key requirements:

- Output format: `es` (ES modules)
- Externalize `react` and `react-dom` (provided by host)
- Single entry point that exports `activate` and optionally `deactivate`
- Named exports for panel components (referenced in manifest `contributes.panels[].component`)

```typescript
// vite.config.ts (plugin)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
```

---

## 10. Migration Path: Extracting Built-in Features

Long-term, built-in features like the Git panel could be extracted as plugins. This is not a launch requirement, but the architecture should make it possible.

### What extraction looks like for the Git panel

**Current dependencies:**
- `GitPanel` / `SessionGitPanel` components (~6 component files)
- `src/api/git.ts` (API wrapper around Tauri IPC commands)
- `src/hooks/useGitStatus.ts`, `useSessionGitSummary.ts`, `useWorktreeEvents.ts`
- Rust backend: `src-tauri/src/git/mod.rs`, `worktree.rs` (~2000 lines)
- State: `ui.gitPanelOpen` flag in the reducer, `TOGGLE_GIT_PANEL` action
- ActivityBar: Git icon in sidebar

**Extraction strategy:**
1. The Git panel React components and hooks move into a plugin.
2. The Rust backend `git/` module remains in the host (or becomes a Tauri plugin) and exposes IPC commands.
3. A new permission `git.read` / `git.write` gates access to git IPC commands.
4. The plugin API gains a `git` namespace that wraps the IPC calls.
5. The `ui.gitPanelOpen` state moves to the plugin's internal state, managed via `hermes.ui.showPanel()` / `hermes.ui.hidePanel()`.

**Why not extract immediately:**
- The Git panel is tightly integrated with session state (worktree resolution per session, realm attachments).
- Performance sensitivity -- Git status polling at 3s intervals needs to stay efficient.
- The cost of the abstraction layer is not justified until there are other similar use cases.

The plugin system is designed so that if/when extraction makes sense, the Git panel can adopt the plugin API without rewriting the Rust backend.

---

## 11. Concrete Example: JSON Formatter Plugin

This is the planned first prototype plugin. It demonstrates all core plugin capabilities.

### User Experience

1. After installation, a `{ }` icon appears in the left ActivityBar.
2. Clicking it opens a panel titled "JSON Formatter" in the left sidebar.
3. The panel has:
   - A text area for pasting/typing JSON
   - Three buttons: Format, Minify, Validate
   - A result area showing formatted output or validation errors
   - A "Copy" button for the result
   - An option to read from clipboard
4. Three commands appear in the Command Palette: "JSON: Format", "JSON: Minify", "JSON: Validate".
5. A status bar item shows "JSON" when the panel is active.

### File Structure

```
json-formatter/
├── hermes-plugin.json
├── package.json
├── tsconfig.json
├── icon.svg
├── src/
│   ├── index.tsx          # activate/deactivate + command handlers
│   └── JsonFormatterPanel.tsx   # The panel React component
└── dist/
    └── index.js
```

### Manifest

```jsonc
{
  "id": "hermes-hq.json-formatter",
  "name": "JSON Formatter",
  "version": "1.0.0",
  "description": "Format, minify, and validate JSON in a side panel.",
  "author": { "name": "Hermes HQ", "url": "https://hermes-ide.com" },
  "license": "Apache-2.0",
  "repository": "https://github.com/hermes-hq/plugins",
  "icon": "./icon.svg",
  "engines": { "hermes": ">=0.4.0" },
  "main": "./dist/index.js",
  "source": "./src/index.tsx",
  "contributes": {
    "sidebarIcons": [
      {
        "id": "json-formatter",
        "icon": "./icon.svg",
        "tooltip": "JSON Formatter",
        "side": "left",
        "position": "top"
      }
    ],
    "panels": [
      {
        "id": "json-formatter-panel",
        "title": "JSON Formatter",
        "icon": "./icon.svg",
        "location": "left",
        "activationEvent": "sidebarIcon:json-formatter",
        "component": "JsonFormatterPanel"
      }
    ],
    "commands": [
      { "id": "json-formatter.format", "title": "Format JSON", "category": "JSON" },
      { "id": "json-formatter.minify", "title": "Minify JSON", "category": "JSON" },
      { "id": "json-formatter.validate", "title": "Validate JSON", "category": "JSON" }
    ],
    "statusBarItems": [
      {
        "id": "json-formatter.status",
        "text": "JSON",
        "tooltip": "JSON Formatter",
        "alignment": "right",
        "priority": 50,
        "command": "json-formatter.format"
      }
    ]
  },
  "permissions": [
    "clipboard.read",
    "clipboard.write",
    "storage"
  ]
}
```

### Entry Point

```tsx
// src/index.tsx
import type { HermesPluginAPI } from "@hermes-ide/plugin-api";
import { JsonFormatterPanel } from "./JsonFormatterPanel";

// Re-export the panel component so the host can resolve it by name
export { JsonFormatterPanel };

let _hermes: HermesPluginAPI | null = null;

export function activate(hermes: HermesPluginAPI) {
  _hermes = hermes;

  // Register panel component
  hermes.ui.registerPanel("json-formatter-panel", JsonFormatterPanel);

  // Register command handlers
  hermes.subscriptions.push(
    hermes.commands.register("json-formatter.format", async () => {
      hermes.ui.showPanel("json-formatter-panel");
      // The panel itself handles the formatting logic
    })
  );

  hermes.subscriptions.push(
    hermes.commands.register("json-formatter.minify", async () => {
      hermes.ui.showPanel("json-formatter-panel");
    })
  );

  hermes.subscriptions.push(
    hermes.commands.register("json-formatter.validate", async () => {
      hermes.ui.showPanel("json-formatter-panel");
    })
  );

  // Update status bar when panel is shown/hidden
  hermes.ui.updateStatusBarItem("json-formatter.status", { visible: false });
}

export function deactivate() {
  _hermes = null;
}

// Export a hook for the panel to access the API
export function useHermesAPI(): HermesPluginAPI {
  if (!_hermes) throw new Error("Plugin not activated");
  return _hermes;
}
```

### Panel Component

```tsx
// src/JsonFormatterPanel.tsx
import { useState, useCallback } from "react";
import { useHermesAPI } from "./index";

export function JsonFormatterPanel() {
  const hermes = useHermesAPI();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const format = useCallback(() => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError(null);
      hermes.ui.updateStatusBarItem("json-formatter.status", {
        text: "JSON Valid",
        visible: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      setOutput("");
      hermes.ui.updateStatusBarItem("json-formatter.status", {
        text: "JSON Invalid",
        visible: true,
      });
    }
  }, [input, hermes]);

  const minify = useCallback(() => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      setOutput("");
    }
  }, [input]);

  const validate = useCallback(() => {
    try {
      JSON.parse(input);
      setError(null);
      setOutput("Valid JSON");
      hermes.ui.showToast("JSON is valid", { type: "success" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      setOutput("");
    }
  }, [input, hermes]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await hermes.clipboard.readText();
      setInput(text);
    } catch (e) {
      hermes.ui.showToast("Failed to read clipboard", { type: "error" });
    }
  }, [hermes]);

  const copyResult = useCallback(async () => {
    try {
      await hermes.clipboard.writeText(output);
      hermes.ui.showToast("Copied to clipboard", { type: "success" });
    } catch (e) {
      hermes.ui.showToast("Failed to copy", { type: "error" });
    }
  }, [output, hermes]);

  return (
    <div className="plugin-panel" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", textTransform: "uppercase", color: "var(--text-2)" }}>
          JSON Formatter
        </span>
        <button onClick={pasteFromClipboard} style={{ fontSize: "var(--text-xs)", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
          Paste
        </button>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste JSON here..."
        style={{
          flex: 1,
          minHeight: 120,
          background: "var(--bg-2)",
          color: "var(--text-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: 8,
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-sm)",
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={format} className="ctx-memory-save-btn">Format</button>
        <button onClick={minify} className="ctx-memory-save-btn">Minify</button>
        <button onClick={validate} className="ctx-memory-save-btn">Validate</button>
      </div>

      {error && (
        <div style={{ color: "var(--red)", fontSize: "var(--text-sm)", padding: "4px 0" }}>
          {error}
        </div>
      )}

      {output && (
        <div style={{ position: "relative" }}>
          <pre style={{
            flex: 1,
            minHeight: 80,
            maxHeight: 300,
            overflow: "auto",
            background: "var(--bg-2)",
            color: "var(--text-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 8,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            margin: 0,
          }}>
            {output}
          </pre>
          <button
            onClick={copyResult}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              fontSize: "var(--text-xs)",
              color: "var(--accent)",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
```

### What This Plugin Demonstrates

- **Manifest-driven contributions:** Sidebar icon, panel, commands, and status bar item are all declared in the manifest.
- **API usage:** Clipboard read/write, toast notifications, status bar updates, panel show/hide.
- **Permission model:** Requests `clipboard.read`, `clipboard.write`, and `storage`.
- **Theming:** Uses CSS custom properties (`var(--bg-2)`, `var(--text-1)`, `var(--accent)`, etc.) inherited from the host -- no custom theme logic needed.
- **React component model:** Standard React component with hooks, state, and callbacks.
- **Error boundary protection:** If `JSON.parse` throws on truly corrupt input, the host's `PanelErrorBoundary` catches it (though the plugin also handles it gracefully).

---

## 12. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Load and render a single hardcoded plugin (JSON Formatter). Prove the architecture works.

**Work items:**
1. Create `src/plugins/PluginRuntime.ts` -- Plugin registry, loader, lifecycle management.
2. Create `src/plugins/PluginAPI.ts` -- The `hermes` API object factory with permission checks.
3. Create `src/plugins/PluginPanelHost.tsx` -- Error boundary wrapper for plugin panels.
4. Modify `ActivityBar` -- Accept dynamically added tabs from plugins.
5. Modify `CommandPalette` -- Merge plugin commands into the command list.
6. Modify `StatusBar` -- Render plugin status bar items.
7. Modify `App.tsx` -- Initialize `PluginRuntime` on mount, render plugin panels in layout.
8. Add `plugins` table to SQLite (plugin ID, version, enabled, permissions granted).
9. Build the JSON Formatter plugin as the test case.
10. Create `@hermes-ide/plugin-api` types package.

### Phase 2: Settings UI and Local Install

**Goal:** Users can enable/disable plugins and install from local directories.

**Work items:**
1. Add "Plugins" tab to Settings dialog.
2. Plugin enable/disable toggle with restart-free activation.
3. "Install from folder" button (symlink-based install).
4. Plugin error reporting in Settings (show activation errors).
5. Dev mode: file watcher for hot reload of symlinked plugins.

### Phase 3: Marketplace

**Goal:** Users can browse and install plugins from the `hermes-hq/plugins` registry.

**Work items:**
1. Registry index fetcher and cacher.
2. "Browse Plugins" UI in Settings.
3. Download and install flow (tarball extraction).
4. Update checking and one-click updates.
5. Uninstall flow.
6. Set up CI pipeline in the `hermes-hq/plugins` repo for building and publishing.

### Phase 4: Advanced APIs

**Goal:** Expand the plugin API surface for more powerful plugins.

**Work items:**
1. `terminal.read` / `terminal.write` permissions and API.
2. `network` permission with domain-scoped access.
3. `filesystem.read` with scoped file picker.
4. Inter-plugin communication (event bus).
5. Plugin settings (contribute to the Settings UI).
6. Bottom panel slot.
7. Context menu contributions.

### Phase 5: Ecosystem

**Goal:** Make plugin development easy and the marketplace useful.

**Work items:**
1. `@hermes-ide/create-plugin` scaffolder.
2. `@hermes-ide/plugin-cli` dev tool.
3. Plugin documentation site.
4. Plugin submission and review workflow.
5. Plugin ratings and reviews.
6. Plugin search and categories.

---

## Appendix A: Comparison with Alternatives Considered

### Iframe-based isolation (rejected)

**Pros:** Strong isolation, familiar web security model, plugins can use any framework.
**Cons:** Poor theming integration (no CSS custom property inheritance), performance overhead (serialization for every API call), complex layout management, poor DX (postMessage API), no access to host React context.

**Decision:** Rejected. The performance and DX costs outweigh the isolation benefits. Permission-based sandboxing is sufficient for a curated marketplace.

### WASM-based plugins (deferred)

**Pros:** True sandboxing, language-agnostic (Rust, Go, C plugins), deterministic execution.
**Cons:** No DOM access (can't render UI), requires a bridge layer for every UI operation, much higher complexity for plugin developers, slow iteration during development.

**Decision:** Deferred. May be considered for computational plugins (linters, formatters, data processors) that don't need UI, but not for the initial system which is primarily about UI extensions.

### Tauri plugin (Rust-side) approach (complementary, not primary)

**Pros:** Full system access, high performance, can extend the IPC command set.
**Cons:** Requires Rust knowledge, requires app recompilation, no hot reload.

**Decision:** The frontend plugin system is primary. Tauri-side plugins may be used internally for capabilities that require native access (e.g., a "file watcher" capability backing), but are not part of the public plugin API.

## Appendix B: Rust Backend Changes Required

### New SQLite Tables

```sql
-- Installed plugins metadata
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,                    -- e.g., "hermes-hq.json-formatter"
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    author_name TEXT,
    install_path TEXT NOT NULL,             -- absolute path to plugin directory
    is_symlink INTEGER DEFAULT 0,          -- 1 if installed from local dir
    enabled INTEGER DEFAULT 1,
    permissions_granted TEXT DEFAULT '[]',  -- JSON array of granted permission strings
    installed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Per-plugin key-value storage
CREATE TABLE IF NOT EXISTS plugin_storage (
    plugin_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, key),
    FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);
```

### New IPC Commands

```rust
// Plugin management
plugin::list_plugins          // List all installed plugins
plugin::install_plugin        // Install from path or URL
plugin::uninstall_plugin      // Remove plugin
plugin::enable_plugin         // Enable a disabled plugin
plugin::disable_plugin        // Disable a plugin
plugin::get_plugin_info       // Get full plugin metadata

// Plugin storage
plugin::plugin_storage_get    // Get a value from plugin storage
plugin::plugin_storage_set    // Set a value in plugin storage
plugin::plugin_storage_delete // Delete a value from plugin storage
plugin::plugin_storage_list   // List all keys for a plugin
```

These commands would live in a new `src-tauri/src/plugin/mod.rs` module.
