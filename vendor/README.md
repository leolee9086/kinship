# Vendored dependency provenance

## Modified Vditor for Kramdown section files

- Source repository: https://github.com/leolee9086/vditor, branch `kinship/section-adapter`.
- Pinned source SHA: `65a4031c2915c458dd4eadea2976827e4f1e400d`.
- Upstream base SHA: `3a0c64cf97345c2b8a0e1d6d53abbc787d53988c`; original MIT license and author attribution are retained.
- Package: `vditor@4.0.1-kinship.2`, [vditor-4.0.1-kinship.2.tgz](./vditor-4.0.1-kinship.2.tgz).
- SHA-256: `2b076fd50f0e40a56016f8fd025ff12c95b12a3ae0bcb2c93625f57a4e0c79df`.
- pnpm integrity: `sha512-CrjUfpFt4UtNyYtl5OI130XJ/b5gh7njYYRPHiXHcwFhVJFKiD2S8PnFsKzudzNb3tYxiRh47XsQsKV8dqmuug==`.

This is the modified source-mode editor, not an unmodified upstream package. It adds exact `getFileText()` and `setFileText(text)` methods: no appended newline, NBSP conversion, or remote-load input callback. Source-mode loads reset editor undo. Other editor modes reject these exact-file APIs. Kinship's whole-file adapter receives only a `TextFile`, ordinal, and DOM lifecycle; the fork has no graph, workspace, version, transaction, or host-command dependency. CRDT is a separate CodeMirror/Yjs adapter, never a partial mode of this Vditor adapter.

The source checkout lives beside Kinship at `../vditor`, with its own Git history and remote. Do not copy the source checkout under Kinship, or collect upstream tests in Kinship's test runner. Build and pack from the reviewed source SHA with pnpm, then update both hashes and the lockfile deliberately. A frozen install with a fresh store verifies the local archive bytes. Follow the source repository's `KINSHIP.md` for the build procedure.

[prepare-vditor-assets.mjs](../scripts/prepare-vditor-assets.mjs) copies browser assets and the MIT license from the pinned installed package before development and production builds. The generated `public/vditor/` directory is ignored; Pages serves these assets beneath its own base path, so source editing does not require a CDN.

## CaliburRouter

Kinship uses the `calibur-router/zod` public API from the local S-Forge package requested for editor command dispatch. The archive is included so a clean Pages checkout can install exactly this source without access to a private local fork.

- Source: `s-forge/packages/caliburRouter`, S-Forge checkout commit `b206db2193345a02b278bf29274a963d91b46568`.
- Package: `calibur-router@0.1.0`; package metadata declares MIT. Existing source headers and README are retained unchanged.
- Archive: [calibur-router-0.1.0.tgz](./calibur-router-0.1.0.tgz).
- SHA-256: `a3cd2fb284ba8c7b1c4bf771e163a51ceedde4db48e53191bebeebc434a0bc69`.
- pnpm integrity: `sha512-a7Y3672mykhriGlvcpodNe5XDE8nZQVR35FYJWiJJ8KY9CJXfzgUA5ur10MyYdEeO+rCYluCmtBN6bpk5g6YTw==`.
- When repacking under the same filename, a cached pnpm install can leave the previous archive integrity in the lockfile. Compare the script output to the exact local resolution entry, then verify with a fresh store (`pnpm install --frozen-lockfile --force --store-dir .tmp/pnpm-fresh-store`). Do not disable integrity validation.
- Contents: original `src/`, compiled `dist/`, README, and runtime package metadata. Development scripts, devDependencies, tests and local compiler logs are excluded from the installed archive. The checked-in source can be audited alongside its compiled entry points.

To refresh, review the source commit, run `pnpm --dir ../s-forge/packages/caliburRouter exec tsc`, then run `node scripts/package-calibur.mjs ../s-forge/packages/caliburRouter` from Kinship. The script copies only the reviewed package files, leaves the source repository unchanged, and prints the archive checksum. It uses the host `tar` executable; filesystem timestamps can change archive bytes, so update this checksum and the pnpm lockfile deliberately, then run a frozen install and the full regression/build checks.

The S-Forge checkout is a personal fork whose configured remote does not guarantee that this local commit can be fetched from GitHub. This document therefore identifies the actual local revision and ships the exact source, rather than attributing those changes to an upstream SiYuan release. No S-Forge Git writes are part of this integration.
