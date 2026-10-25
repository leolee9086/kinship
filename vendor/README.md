# Vendored dependency provenance

## Modified Vditor for Kramdown section files

- Source repository: https://github.com/leolee9086/vditor, branch `kinship/source-task-toggle`.
- Pinned source SHA: `454159ed16ff6a72f04e3ba615a940133463878a`.
- Upstream base SHA: `3a0c64cf97345c2b8a0e1d6d53abbc787d53988c`; original MIT license and author attribution are retained.
- Package: `vditor@4.0.1-kinship.4`, [vditor-4.0.1-kinship.4.tgz](./vditor-4.0.1-kinship.4.tgz).
- SHA-256: `be790627cb348ee3acc513da01ef843ff8c73aed25d999c42a223fc6f440c998`.
- pnpm integrity: `sha512-U1dlPux+h5AnLveUt7+pLmBgNBxDQXQhtXqS5102UP5a6vPJ7GALBsADMK/EwC7pqZb2VzuFeYuAIzRn4dZRzA==`.

This is the modified source-mode editor, not an unmodified upstream package. It adds exact `getFileText()` and `setFileText(text)` methods: no appended newline, NBSP conversion, or remote-load input callback. Source-mode loads reset editor undo. Other editor modes reject these exact-file APIs. Kinship's whole-file adapter receives only a `TextFile`, ordinal, and DOM lifecycle; the fork has no graph, workspace, version, transaction, or host-command dependency. CRDT is a separate CodeMirror/Yjs adapter, never a partial mode of this Vditor adapter. Version `4.0.1-kinship.4` adds source task completion with a dedicated button and Ctrl/Meta+Shift+J; fenced-code examples are excluded by the bundled public CaliburRouter npm implementation. All 35 editor suites (166 tests), TypeScript and the production build pass.

The source checkout lives beside Kinship at `../vditor`, with its own Git history and remote. Do not copy the source checkout under Kinship, or collect upstream tests in Kinship's test runner. Build and pack from the reviewed source SHA with pnpm, then update both hashes and the lockfile deliberately. A frozen install with a fresh store verifies the local archive bytes. Follow the source repository's `KINSHIP.md` for the build procedure.

[prepare-vditor-assets.mjs](../scripts/prepare-vditor-assets.mjs) copies browser assets and the MIT license from the pinned installed package before development and production builds. The generated `public/vditor/` directory is ignored; Pages serves these assets beneath its own base path, so source editing does not require a CDN.

## CaliburRouter

Kinship uses the public `calibur-router/zod` API from the standalone npm package `calibur-router@0.1.0`, installed from the npm registry and pinned by pnpm-lock.yaml.

- Source repository: https://github.com/leolee9086/calibur-router.
- Initial extraction commit: `82336748788b273c57a88d08fe8e5c492d5c1581`; MIT license.
- Original implementation: S-Forge `packages/caliburRouter` at `b206db2193345a02b278bf29274a963d91b46568`.

The local CaliburRouter archive and packaging script are no longer used. Update the package version with pnpm rather than repacking the former S-Forge directory.
