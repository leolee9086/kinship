# Vendored dependency provenance

## Modified Vditor for Kramdown section files

- Source repository: https://github.com/leolee9086/vditor, branch `kinship/section-adapter`.
- Pinned source SHA: `2c86c9b37e6fb40bc592133564783912c59c582c`.
- Upstream base SHA: `3a0c64cf97345c2b8a0e1d6d53abbc787d53988c`; original MIT license and author attribution are retained.
- Package: `vditor@4.0.1-kinship.3`, [vditor-4.0.1-kinship.3.tgz](./vditor-4.0.1-kinship.3.tgz).
- SHA-256: `4a2203041c3992813000e26313750ad289a21dcbf2ea94c9c1ceaa87cb976da3`.
- pnpm integrity: `sha512-dIftQD8ObJdvw/Gz66CHsl3P8kPvsdfgxrsygtGdEY7kqKSD+gbSPK7zjWfDDk1q2/U2UCcUVm/Hx+bkkoBygg==`.

This is the modified source-mode editor, not an unmodified upstream package. It adds exact `getFileText()` and `setFileText(text)` methods: no appended newline, NBSP conversion, or remote-load input callback. Source-mode loads reset editor undo. Other editor modes reject these exact-file APIs. Kinship's whole-file adapter receives only a `TextFile`, ordinal, and DOM lifecycle; the fork has no graph, workspace, version, transaction, or host-command dependency. CRDT is a separate CodeMirror/Yjs adapter, never a partial mode of this Vditor adapter.

The source checkout lives beside Kinship at `../vditor`, with its own Git history and remote. Do not copy the source checkout under Kinship, or collect upstream tests in Kinship's test runner. Build and pack from the reviewed source SHA with pnpm, then update both hashes and the lockfile deliberately. A frozen install with a fresh store verifies the local archive bytes. Follow the source repository's `KINSHIP.md` for the build procedure.

[prepare-vditor-assets.mjs](../scripts/prepare-vditor-assets.mjs) copies browser assets and the MIT license from the pinned installed package before development and production builds. The generated `public/vditor/` directory is ignored; Pages serves these assets beneath its own base path, so source editing does not require a CDN.

## CaliburRouter

Kinship uses the public `calibur-router/zod` API from the standalone npm package `calibur-router@0.1.0`, installed from the npm registry and pinned by pnpm-lock.yaml.

- Source repository: https://github.com/leolee9086/calibur-router.
- Initial extraction commit: `82336748788b273c57a88d08fe8e5c492d5c1581`; MIT license.
- Original implementation: S-Forge `packages/caliburRouter` at `b206db2193345a02b278bf29274a963d91b46568`.

The local CaliburRouter archive and packaging script are no longer used. Update the package version with pnpm rather than repacking the former S-Forge directory.
