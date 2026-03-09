import { invoke } from "@tauri-apps/api/core";

export type InstallPhase = "downloading" | "extracting" | "done";

/**
 * Download a plugin .tgz from a URL and install it.
 * Uses browser fetch() to download, then passes raw bytes to Rust for extraction.
 */
export async function downloadAndInstallPlugin(
    downloadUrl: string,
    onProgress?: (phase: InstallPhase) => void,
): Promise<string> {
    onProgress?.("downloading");

    const response = await fetch(downloadUrl);
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    onProgress?.("extracting");

    const pluginId = await invoke<string>("install_plugin", { data: bytes });

    onProgress?.("done");

    return pluginId;
}
