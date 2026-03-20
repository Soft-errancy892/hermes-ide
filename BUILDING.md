# Building Hermes IDE

Instructions for building Hermes IDE from source.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [Node.js](https://nodejs.org) | 20+ | [nodejs.org](https://nodejs.org) |
| [Rust](https://rustup.rs) | Pinned in `rust-toolchain.toml` | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |

The Rust toolchain version is pinned in `rust-toolchain.toml` at the repository root. Running `rustup show` in the repo will install and activate the correct version automatically.

### Platform-Specific Dependencies

**macOS:**

```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libfuse2
```

**Windows:**

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload. Windows 10 users may also need to install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

## Clone and Setup

```bash
git clone https://github.com/hermes-hq/hermes-ide.git
cd hermes-ide
npm ci
```

## Development

```bash
npm run dev          # Vite dev server only (frontend)
npm run tauri dev    # Full Tauri app with hot-reload
```

## Production Build

```bash
npm run tauri build
```

Build artifacts are output to `src-tauri/target/release/bundle/`.

### Cross-Platform Build Targets

| Platform | Target | CI Runner |
|----------|--------|-----------|
| macOS (Apple Silicon) | `aarch64-apple-darwin` | `macos-14` |
| macOS (Intel) | `x86_64-apple-darwin` | `macos-14` |
| Linux (x86_64) | `x86_64-unknown-linux-gnu` | `ubuntu-22.04` |
| Linux (ARM64) | `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm` |
| Windows (x86_64) | `x86_64-pc-windows-msvc` | `windows-2022` |
| Windows (ARM64) | `aarch64-pc-windows-msvc` | `windows-2022` |

To build for a specific target:

```bash
npx tauri build --target aarch64-apple-darwin
```

## Tests

```bash
npm run test                    # Frontend tests
cd src-tauri && cargo test      # Rust tests
npx tsc --noEmit                # TypeScript type check
```

## Reproducibility

This project follows supply chain security best practices for reproducible builds:

- **Deterministic dependency resolution:** `npm ci` reads `package-lock.json` exactly; `Cargo.lock` is committed and used by `cargo build` automatically.
- **Pinned Rust toolchain:** The version in `rust-toolchain.toml` ensures all contributors and CI use the same compiler.
- **Pinned CI actions:** All GitHub Actions in `.github/workflows/` are pinned to commit SHAs to prevent supply chain attacks via tag mutation.
- **Pinned CI runners:** Runner images use specific OS versions (not `-latest`) to avoid silent environment changes.
- **SLSA provenance:** Release builds generate provenance attestations via `actions/attest-build-provenance`, so anyone can verify that published binaries were built from the expected source in the expected CI environment.

### Verifying a Release

Each GitHub release includes a `SHA256SUMS.txt` file. To verify a downloaded binary:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

To verify SLSA provenance attestations:

```bash
gh attestation verify <artifact-file> --repo hermes-hq/hermes-ide
```

### Note on Code Signing

Signed binaries (macOS) differ between builds because signatures are unique. To verify reproducibility, compare unsigned builds.

## License

Hermes IDE is source-available under the [Business Source License 1.1](LICENSE). Contributions require signing the [CLA](CLA.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
