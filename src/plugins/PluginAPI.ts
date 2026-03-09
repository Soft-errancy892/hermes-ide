import type { Disposable } from "./types";
import { invoke } from "@tauri-apps/api/core";

// Props passed to plugin panel components via React context
export interface PluginPanelProps {
	pluginId: string;
	panelId: string;
}

// The API surface available to every plugin
export interface HermesPluginAPI {
	ui: {
		registerPanel(panelId: string, component: React.ComponentType<PluginPanelProps>): Disposable;
		showPanel(panelId: string): void;
		hidePanel(panelId: string): void;
		togglePanel(panelId: string): void;
		showToast(message: string, options?: { type?: "info" | "success" | "warning" | "error"; duration?: number }): void;
		updateStatusBarItem(itemId: string, update: { text?: string; tooltip?: string; visible?: boolean }): void;
	};
	commands: {
		register(commandId: string, handler: () => void | Promise<void>): Disposable;
		execute(commandId: string): Promise<void>;
	};
	clipboard: {
		readText(): Promise<string>;
		writeText(text: string): Promise<void>;
	};
	storage: {
		get(key: string): Promise<string | null>;
		set(key: string, value: string): Promise<void>;
		delete(key: string): Promise<void>;
	};
	subscriptions: Disposable[];
}

export class PermissionDeniedError extends Error {
	constructor(pluginId: string, permission: string) {
		super(`Plugin "${pluginId}" requires permission "${permission}" which was not granted.`);
		this.name = "PermissionDeniedError";
	}
}

export type PanelToggleCallback = (panelId: string) => void;
export type ToastCallback = (message: string, type: string, duration?: number) => void;
export type StatusBarUpdateCallback = (itemId: string, update: { text?: string; tooltip?: string; visible?: boolean }) => void;

export interface PluginAPICallbacks {
	onPanelToggle: PanelToggleCallback;
	onPanelShow: PanelToggleCallback;
	onPanelHide: PanelToggleCallback;
	onToast: ToastCallback;
	onStatusBarUpdate: StatusBarUpdateCallback;
}

export function createPluginAPI(
	pluginId: string,
	permissions: Set<string>,
	callbacks: PluginAPICallbacks,
	commandHandlers: Map<string, () => void | Promise<void>>,
	panelComponents: Map<string, React.ComponentType<PluginPanelProps>>,
): HermesPluginAPI {
	const subscriptions: Disposable[] = [];

	return {
		ui: {
			registerPanel(panelId: string, component: React.ComponentType<PluginPanelProps>) {
				if (panelComponents.has(panelId)) {
					console.warn(`[Plugin:${pluginId}] Panel ID "${panelId}" is already registered — overwriting`);
				}
				panelComponents.set(panelId, component);
				return {
					dispose() {
						panelComponents.delete(panelId);
					},
				};
			},
			showPanel(panelId: string) {
				callbacks.onPanelShow(panelId);
			},
			hidePanel(panelId: string) {
				callbacks.onPanelHide(panelId);
			},
			togglePanel(panelId: string) {
				callbacks.onPanelToggle(panelId);
			},
			showToast(message: string, options?: { type?: "info" | "success" | "warning" | "error"; duration?: number }) {
				callbacks.onToast(message, options?.type ?? "info", options?.duration);
			},
			updateStatusBarItem(itemId: string, update: { text?: string; tooltip?: string; visible?: boolean }) {
				callbacks.onStatusBarUpdate(itemId, update);
			},
		},
		commands: {
			register(commandId: string, handler: () => void | Promise<void>) {
				if (commandHandlers.has(commandId)) {
					console.warn(`[Plugin:${pluginId}] Command ID "${commandId}" is already registered — overwriting`);
				}
				commandHandlers.set(commandId, handler);
				return {
					dispose() {
						commandHandlers.delete(commandId);
					},
				};
			},
			async execute(commandId: string) {
				const handler = commandHandlers.get(commandId);
				if (handler) await handler();
			},
		},
		clipboard: {
			readText() {
				if (!permissions.has("clipboard.read")) {
					throw new PermissionDeniedError(pluginId, "clipboard.read");
				}
				return navigator.clipboard.readText();
			},
			writeText(text: string) {
				if (!permissions.has("clipboard.write")) {
					throw new PermissionDeniedError(pluginId, "clipboard.write");
				}
				return navigator.clipboard.writeText(text);
			},
		},
		storage: {
			async get(key: string) {
				if (!permissions.has("storage")) {
					throw new PermissionDeniedError(pluginId, "storage");
				}
				return invoke<string | null>("get_plugin_setting", { pluginId, key });
			},
			async set(key: string, value: string) {
				if (!permissions.has("storage")) {
					throw new PermissionDeniedError(pluginId, "storage");
				}
				await invoke("set_plugin_setting", { pluginId, key, value });
			},
			async delete(key: string) {
				if (!permissions.has("storage")) {
					throw new PermissionDeniedError(pluginId, "storage");
				}
				await invoke("delete_plugin_setting", { pluginId, key });
			},
		},
		subscriptions,
	};
}
