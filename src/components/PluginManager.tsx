import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest } from "../plugins/types";
import { downloadAndInstallPlugin, type InstallPhase } from "../plugins/pluginInstaller";
import { hasUpdate, meetsMinVersion } from "../plugins/semver";

interface InstalledPluginInfo {
	id: string;
	dir_name: string;
	manifest_json: string;
}

interface PluginEntry {
	manifest: PluginManifest;
	dirName: string;
	enabled: boolean;
}

interface RegistryPlugin {
	id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	downloadUrl: string;
	minAppVersion?: string;
	permissions?: string[];
}

const REGISTRY_URL = "https://raw.githubusercontent.com/hermes-hq/plugins/main/registry/index.json";

// Read app version from Tauri config embedded at build time
declare const __APP_VERSION__: string;

export function PluginManager() {
	const [installed, setInstalled] = useState<PluginEntry[]>([]);
	const [registry, setRegistry] = useState<RegistryPlugin[]>([]);
	const [pluginsDir, setPluginsDir] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [installingId, setInstallingId] = useState<string | null>(null);
	const [installPhase, setInstallPhase] = useState<InstallPhase | null>(null);
	const [togglingId, setTogglingId] = useState<string | null>(null);

	const loadPlugins = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [plugins, dir, disabledIds] = await Promise.all([
				invoke<InstalledPluginInfo[]>("list_installed_plugins"),
				invoke<string>("get_plugins_dir"),
				invoke<string[]>("get_disabled_plugin_ids").catch(() => [] as string[]),
			]);

			setPluginsDir(dir);
			const disabledSet = new Set(disabledIds);

			const entries: PluginEntry[] = [];
			for (const p of plugins) {
				try {
					const manifest = JSON.parse(p.manifest_json) as PluginManifest;
					entries.push({ manifest, dirName: p.dir_name, enabled: !disabledSet.has(manifest.id) });
				} catch {
					// Skip plugins with invalid manifests
				}
			}
			setInstalled(entries);
		} catch (err) {
			setError(String(err));
		}
		setLoading(false);
	}, []);

	const loadRegistry = useCallback(async () => {
		try {
			const resp = await fetch(REGISTRY_URL);
			if (!resp.ok) return;
			const data = await resp.json();
			setRegistry(data.plugins ?? []);
		} catch {
			// Registry unavailable — not critical
		}
	}, []);

	useEffect(() => {
		loadPlugins();
		loadRegistry();
	}, [loadPlugins, loadRegistry]);

	const handleUninstall = useCallback(async (dirName: string, pluginName: string) => {
		if (!confirm(`Uninstall "${pluginName}"? This will remove the plugin files.`)) return;
		try {
			await invoke("uninstall_plugin", { pluginDir: dirName });
			await loadPlugins();
		} catch (err) {
			setError(`Failed to uninstall: ${err}`);
		}
	}, [loadPlugins]);

	const handleInstall = useCallback(async (plugin: RegistryPlugin) => {
		setInstallingId(plugin.id);
		setInstallPhase(null);
		setError(null);
		try {
			await downloadAndInstallPlugin(plugin.downloadUrl, (phase) => setInstallPhase(phase));
			await loadPlugins();
		} catch (err) {
			setError(`Failed to install "${plugin.name}": ${err}`);
		}
		setInstallingId(null);
		setInstallPhase(null);
	}, [loadPlugins]);

	const handleUpdate = useCallback(async (plugin: RegistryPlugin) => {
		setInstallingId(plugin.id);
		setInstallPhase(null);
		setError(null);
		try {
			await downloadAndInstallPlugin(plugin.downloadUrl, (phase) => setInstallPhase(phase));
			await loadPlugins();
		} catch (err) {
			setError(`Failed to update "${plugin.name}": ${err}`);
		}
		setInstallingId(null);
		setInstallPhase(null);
	}, [loadPlugins]);

	const handleToggleEnabled = useCallback(async (pluginId: string, currentlyEnabled: boolean) => {
		setTogglingId(pluginId);
		try {
			await invoke("set_plugin_enabled", { pluginId, enabled: !currentlyEnabled });
			setInstalled(prev => prev.map(p =>
				p.manifest.id === pluginId ? { ...p, enabled: !currentlyEnabled } : p
			));
		} catch (err) {
			setError(`Failed to toggle plugin: ${err}`);
		}
		setTogglingId(null);
	}, []);

	const installedIds = new Set(installed.map(p => p.manifest.id));
	const installedVersions = new Map(installed.map(p => [p.manifest.id, p.manifest.version]));

	// Split registry into: available (not installed) and updatable (installed but older)
	const availablePlugins: RegistryPlugin[] = [];
	const updatablePlugins: RegistryPlugin[] = [];
	for (const rp of registry) {
		if (!installedIds.has(rp.id)) {
			availablePlugins.push(rp);
		} else {
			const currentVersion = installedVersions.get(rp.id);
			if (currentVersion && hasUpdate(currentVersion, rp.version)) {
				updatablePlugins.push(rp);
			}
		}
	}

	const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

	const phaseLabel = (phase: InstallPhase | null) => {
		switch (phase) {
			case "downloading": return "Downloading...";
			case "extracting": return "Installing...";
			case "done": return "Done";
			default: return "Installing...";
		}
	};

	const btnStyle = (variant: "primary" | "danger" | "muted") => ({
		background: variant === "primary" ? "var(--accent, var(--blue))" : "none",
		border: variant === "primary" ? "none" : "1px solid var(--border)",
		borderRadius: "var(--radius-sm)",
		color: variant === "danger" ? "var(--red)" : variant === "primary" ? "#fff" : "var(--text-2)",
		padding: "3px 10px",
		fontSize: "var(--text-xs)" as const,
		cursor: "pointer" as const,
		marginLeft: 8,
		flexShrink: 0 as const,
	});

	return (
		<div className="settings-section">
			{error && (
				<div style={{ color: "var(--red)", fontSize: "var(--text-xs)", marginBottom: 12 }}>
					{error}
				</div>
			)}

			{/* Installed Plugins */}
			<div className="settings-group">
				<label className="settings-label">Installed Plugins</label>
				{loading ? (
					<p className="settings-hint">Loading...</p>
				) : installed.length === 0 ? (
					<p className="settings-hint">No plugins installed. Browse the available plugins below to get started.</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{installed.map((p) => {
							const update = updatablePlugins.find(u => u.id === p.manifest.id);
							const isToggling = togglingId === p.manifest.id;
							const isUpdating = installingId === p.manifest.id;

							return (
								<div
									key={p.manifest.id}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "8px 12px",
										background: "var(--bg-2)",
										borderRadius: "var(--radius-sm)",
										border: "1px solid var(--border)",
										opacity: p.enabled ? 1 : 0.6,
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>
											{p.manifest.name}
											<span style={{ color: "var(--text-2)", fontWeight: 400, marginLeft: 6, fontSize: "var(--text-xs)" }}>
												v{p.manifest.version}
											</span>
											{!p.enabled && (
												<span style={{ color: "var(--text-3, var(--text-2))", fontWeight: 400, marginLeft: 6, fontSize: "var(--text-xs)" }}>
													(disabled)
												</span>
											)}
											{update && (
												<span style={{ color: "var(--green, #4ade80)", fontWeight: 400, marginLeft: 6, fontSize: "var(--text-xs)" }}>
													v{update.version} available
												</span>
											)}
										</div>
										<div style={{ color: "var(--text-2)", fontSize: "var(--text-xs)", marginTop: 2 }}>
											{p.manifest.description}
										</div>
									</div>
									<div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
										{update && !isUpdating && (
											<button onClick={() => handleUpdate(update)} style={btnStyle("primary")}>
												Update
											</button>
										)}
										{isUpdating && (
											<span style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginLeft: 8 }}>
												{phaseLabel(installPhase)}
											</span>
										)}
										<button
											onClick={() => handleToggleEnabled(p.manifest.id, p.enabled)}
											disabled={isToggling}
											style={btnStyle("muted")}
										>
											{p.enabled ? "Disable" : "Enable"}
										</button>
										<button
											onClick={() => handleUninstall(p.dirName, p.manifest.name)}
											style={btnStyle("danger")}
										>
											Uninstall
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Available Plugins from Registry */}
			{availablePlugins.length > 0 && (
				<div className="settings-group" style={{ marginTop: 16 }}>
					<label className="settings-label">Available Plugins</label>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{availablePlugins.map((p) => {
							const isInstalling = installingId === p.id;
							const compatible = !p.minAppVersion || meetsMinVersion(appVersion, p.minAppVersion);

							return (
								<div
									key={p.id}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "8px 12px",
										background: "var(--bg-2)",
										borderRadius: "var(--radius-sm)",
										border: "1px solid var(--border)",
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>
											{p.name}
											<span style={{ color: "var(--text-2)", fontWeight: 400, marginLeft: 6, fontSize: "var(--text-xs)" }}>
												v{p.version}
											</span>
										</div>
										<div style={{ color: "var(--text-2)", fontSize: "var(--text-xs)", marginTop: 2 }}>
											{p.description}
										</div>
										<div style={{ color: "var(--text-3, var(--text-2))", fontSize: "var(--text-xs)", marginTop: 2, opacity: 0.7 }}>
											by {p.author}
										</div>
										{!compatible && (
											<div style={{ color: "var(--yellow, #facc15)", fontSize: "var(--text-xs)", marginTop: 4 }}>
												Requires app v{p.minAppVersion}+
											</div>
										)}
									</div>
									{isInstalling ? (
										<span style={{ fontSize: "var(--text-xs)", color: "var(--text-2)", marginLeft: 12, flexShrink: 0 }}>
											{phaseLabel(installPhase)}
										</span>
									) : (
										<button
											onClick={() => handleInstall(p)}
											disabled={!compatible}
											style={{
												...btnStyle("primary"),
												opacity: compatible ? 1 : 0.5,
												cursor: compatible ? "pointer" : "not-allowed",
											}}
										>
											Install
										</button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Plugin Directory Info */}
			<div className="settings-group" style={{ marginTop: 16 }}>
				<label className="settings-label">Plugin Directory</label>
				<p className="settings-hint" style={{ wordBreak: "break-all" }}>
					{pluginsDir || "Loading..."}
				</p>
				<p className="settings-hint">
					Restart the app after installing, updating, enabling, or disabling plugins for changes to take full effect.
				</p>
			</div>
		</div>
	);
}
