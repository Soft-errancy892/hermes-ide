import type { HermesEvent, Disposable } from "./types";

export class PluginEventBus {
	private listeners = new Map<HermesEvent, Set<(...args: any[]) => void>>();

	on(event: HermesEvent, callback: (...args: any[]) => void): Disposable {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
		return {
			dispose: () => {
				this.listeners.get(event)?.delete(callback);
			},
		};
	}

	emit(event: HermesEvent, ...args: any[]): void {
		const callbacks = this.listeners.get(event);
		if (!callbacks) return;
		for (const cb of callbacks) {
			try {
				cb(...args);
			} catch (err) {
				console.error(`[PluginEventBus] Error in "${event}" listener:`, err);
			}
		}
	}

	removeAllListeners(): void {
		this.listeners.clear();
	}

	listenerCount(event: HermesEvent): number {
		return this.listeners.get(event)?.size ?? 0;
	}
}
