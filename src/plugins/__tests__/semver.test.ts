import { describe, it, expect } from "vitest";
import { compareSemver, hasUpdate, meetsMinVersion } from "../semver";

describe("semver", () => {
    describe("compareSemver", () => {
        it("returns 0 for equal versions", () => {
            expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
        });
        it("returns 1 when a > b", () => {
            expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
            expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
            expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
        });
        it("returns -1 when a < b", () => {
            expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
            expect(compareSemver("0.9.0", "1.0.0")).toBe(-1);
        });
        it("handles missing patch version", () => {
            expect(compareSemver("1.0", "1.0.0")).toBe(0);
        });
    });

    describe("hasUpdate", () => {
        it("detects available updates", () => {
            expect(hasUpdate("1.0.0", "1.1.0")).toBe(true);
            expect(hasUpdate("1.0.0", "2.0.0")).toBe(true);
        });
        it("returns false when up to date", () => {
            expect(hasUpdate("1.0.0", "1.0.0")).toBe(false);
            expect(hasUpdate("2.0.0", "1.0.0")).toBe(false);
        });
    });

    describe("meetsMinVersion", () => {
        it("passes when app version meets requirement", () => {
            expect(meetsMinVersion("0.4.0", "0.4.0")).toBe(true);
            expect(meetsMinVersion("1.0.0", "0.4.0")).toBe(true);
        });
        it("fails when app version is too old", () => {
            expect(meetsMinVersion("0.3.37", "0.4.0")).toBe(false);
        });
    });
});
