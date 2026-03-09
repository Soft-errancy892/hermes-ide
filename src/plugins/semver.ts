/** Compare two semver strings (X.Y.Z). Returns -1, 0, or 1. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

/** Check if `current` is older than `latest`. */
export function hasUpdate(current: string, latest: string): boolean {
    return compareSemver(current, latest) < 0;
}

/** Check if `appVersion` meets `minAppVersion` requirement. */
export function meetsMinVersion(appVersion: string, minAppVersion: string): boolean {
    return compareSemver(appVersion, minAppVersion) >= 0;
}
