import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { downloadAndInstallPlugin } from "../pluginInstaller";

const mockInvoke = vi.mocked(invoke);

describe("downloadAndInstallPlugin", () => {
    beforeEach(() => {
        mockInvoke.mockReset();
    });

    it("calls Rust download_and_install_plugin command", async () => {
        mockInvoke.mockResolvedValue("test-plugin-id");

        const result = await downloadAndInstallPlugin("https://example.com/plugin.tgz");

        expect(mockInvoke).toHaveBeenCalledWith("download_and_install_plugin", { url: "https://example.com/plugin.tgz" });
        expect(result).toBe("test-plugin-id");
    });

    it("calls progress callback", async () => {
        mockInvoke.mockResolvedValue("test-id");

        const onProgress = vi.fn();
        await downloadAndInstallPlugin("https://example.com/plugin.tgz", onProgress);

        expect(onProgress).toHaveBeenCalledWith("downloading");
        expect(onProgress).toHaveBeenCalledWith("done");
    });

    it("throws on Rust error", async () => {
        mockInvoke.mockRejectedValue(new Error("Download failed: HTTP 404"));

        await expect(
            downloadAndInstallPlugin("https://example.com/missing.tgz")
        ).rejects.toThrow("Download failed: HTTP 404");
    });
});
