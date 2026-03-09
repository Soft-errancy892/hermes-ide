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
        vi.stubGlobal("fetch", vi.fn());
    });

    it("downloads and passes bytes to Rust", async () => {
        const mockArrayBuffer = new ArrayBuffer(8);
        const mockResponse = {
            ok: true,
            arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        };
        (globalThis.fetch as any).mockResolvedValue(mockResponse);
        mockInvoke.mockResolvedValue("test-plugin-id");

        const result = await downloadAndInstallPlugin("https://example.com/plugin.tgz");

        expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/plugin.tgz");
        expect(mockInvoke).toHaveBeenCalledWith("install_plugin", { data: expect.any(Array) });
        expect(result).toBe("test-plugin-id");
    });

    it("calls progress callback", async () => {
        const mockResponse = {
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        };
        (globalThis.fetch as any).mockResolvedValue(mockResponse);
        mockInvoke.mockResolvedValue("test-id");

        const onProgress = vi.fn();
        await downloadAndInstallPlugin("https://example.com/plugin.tgz", onProgress);

        expect(onProgress).toHaveBeenCalledWith("downloading");
        expect(onProgress).toHaveBeenCalledWith("extracting");
        expect(onProgress).toHaveBeenCalledWith("done");
    });

    it("throws on download failure", async () => {
        (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

        await expect(
            downloadAndInstallPlugin("https://example.com/missing.tgz")
        ).rejects.toThrow("Download failed: 404 Not Found");
    });
});
