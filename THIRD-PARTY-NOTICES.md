# Third-party notices

Kinship's original application code is licensed under **AGPL-3.0-or-later**. This does not replace the licenses of third-party software or example data.

## Demonstration data

The current demo concepts and relationships are fictional, created in this repository and initialized directly as UUID concepts. The old Gramps-derived person/family fixture was removed from the active source tree; no personal IndexedDB export is included. The upstream [Gramps](https://github.com/gramps-project/gramps) attribution and its copy of the GPL text remain in repository history for older released revisions; the current demo does not import or copy that fixture.

## Software dependencies

Dependencies are obtained through pnpm and retain their original copyright notices and licenses. In particular, [sac-path-router](https://github.com/leolee9086/sac-path-router) is a separately maintained MIT-licensed package, referenced from a sibling checkout during current development.

The section editors use MIT-licensed Vditor (a separately maintained Kinship fork), CodeMirror 6, Yjs, y-codemirror.next, and Zod. Vditor's upstream copyright and MIT license are retained; the exact fork archive is pinned, and its license is copied with self-hosted browser assets during builds. File command dispatch uses the local S-Forge `calibur-router` package, whose metadata declares MIT. Both vendored archives have [source revisions, archive checksums, and reproduction instructions](./vendor/README.md). The archived source headers and author attribution are preserved.

The repository does not vendor `node_modules` or application distribution bundles. Before distributing a built bundle, preserve the applicable dependency license notices with that distribution.
