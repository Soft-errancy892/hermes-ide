import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPluginAPI, PermissionDeniedError, type PluginAPICallbacks } from "../PluginAPI";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

function createMockCallbacks(): PluginAPICallbacks {
	return {
		onPanelToggle: vi.fn(),
		onPanelShow: vi.fn(),
		onPanelHide: vi.fn(),
		onToast: vi.fn(),
		onStatusBarUpdate: vi.fn(),
	};
}

describe("createPluginAPI", () => {
	let callbacks: PluginAPICallbacks;
	let commandHandlers: Map<string, () => void | Promise<void>>;
	let panelComponents: Map<string, React.ComponentType<any>>;

	beforeEach(() => {
		callbacks = createMockCallbacks();
		commandHandlers = new Map();
		panelComponents = new Map();
		mockInvoke.mockReset();
	});

	describe("permissions", () => {
		it("should allow clipboard read when permission is granted", async () => {
			const api = createPluginAPI("test", new Set(["clipboard.read"]), callbacks, commandHandlers, panelComponents);
			expect(() => api.clipboard.readText()).not.toThrow(PermissionDeniedError);
		});

		it("should deny clipboard read when permission is not granted", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			expect(() => api.clipboard.readText()).toThrow(PermissionDeniedError);
		});

		it("should deny clipboard write when permission is not granted", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			expect(() => api.clipboard.writeText("test")).toThrow(PermissionDeniedError);
		});

		it("should deny storage when permission is not granted", async () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			await expect(api.storage.get("key")).rejects.toThrow(PermissionDeniedError);
		});

		it("should allow storage when permission is granted", async () => {
			mockInvoke.mockResolvedValue(undefined);
			const api = createPluginAPI("test", new Set(["storage"]), callbacks, commandHandlers, panelComponents);
			await api.storage.set("key", "value");
			expect(mockInvoke).toHaveBeenCalledWith("set_plugin_setting", { pluginId: "test", key: "key", value: "value" });
		});
	});

	describe("commands", () => {
		it("should register command handlers", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			const handler = vi.fn();
			api.commands.register("test.cmd", handler);
			expect(commandHandlers.has("test.cmd")).toBe(true);
		});

		it("should dispose command handlers", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			const handler = vi.fn();
			const disposable = api.commands.register("test.cmd", handler);
			disposable.dispose();
			expect(commandHandlers.has("test.cmd")).toBe(false);
		});

		it("should execute command handlers", async () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			const handler = vi.fn();
			api.commands.register("test.cmd", handler);
			await api.commands.execute("test.cmd");
			expect(handler).toHaveBeenCalledOnce();
		});
	});

	describe("ui", () => {
		it("should register panel components", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			const Component = () => null;
			api.ui.registerPanel("panel-1", Component as any);
			expect(panelComponents.get("panel-1")).toBe(Component);
		});

		it("should call onPanelShow callback", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			api.ui.showPanel("panel-1");
			expect(callbacks.onPanelShow).toHaveBeenCalledWith("panel-1");
		});

		it("should call onPanelHide callback", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			api.ui.hidePanel("panel-1");
			expect(callbacks.onPanelHide).toHaveBeenCalledWith("panel-1");
		});

		it("should call onToast callback with duration", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			api.ui.showToast("Hello", { type: "success", duration: 5000 });
			expect(callbacks.onToast).toHaveBeenCalledWith("Hello", "success", 5000);
		});

		it("should call onToast with default type and undefined duration", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			api.ui.showToast("Hello");
			expect(callbacks.onToast).toHaveBeenCalledWith("Hello", "info", undefined);
		});

		it("should call onStatusBarUpdate callback", () => {
			const api = createPluginAPI("test", new Set(), callbacks, commandHandlers, panelComponents);
			api.ui.updateStatusBarItem("item-1", { text: "Updated" });
			expect(callbacks.onStatusBarUpdate).toHaveBeenCalledWith("item-1", { text: "Updated" });
		});
	});

	describe("storage", () => {
		it("should call Tauri invoke for storage get", async () => {
			mockInvoke.mockResolvedValue("stored-value");
			const api = createPluginAPI("my-plugin", new Set(["storage"]), callbacks, commandHandlers, panelComponents);
			const result = await api.storage.get("key");
			expect(result).toBe("stored-value");
			expect(mockInvoke).toHaveBeenCalledWith("get_plugin_setting", { pluginId: "my-plugin", key: "key" });
		});

		it("should call Tauri invoke for storage set", async () => {
			mockInvoke.mockResolvedValue(undefined);
			const api = createPluginAPI("my-plugin", new Set(["storage"]), callbacks, commandHandlers, panelComponents);
			await api.storage.set("key", "value");
			expect(mockInvoke).toHaveBeenCalledWith("set_plugin_setting", { pluginId: "my-plugin", key: "key", value: "value" });
		});

		it("should call Tauri invoke for storage delete", async () => {
			mockInvoke.mockResolvedValue(undefined);
			const api = createPluginAPI("my-plugin", new Set(["storage"]), callbacks, commandHandlers, panelComponents);
			await api.storage.delete("key");
			expect(mockInvoke).toHaveBeenCalledWith("delete_plugin_setting", { pluginId: "my-plugin", key: "key" });
		});
	});
});
