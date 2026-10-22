# Third-party notices

Kinship's original application code is licensed under **AGPL-3.0-or-later**. This does not replace the licenses of third-party software or example data.

## Gramps example fixture

[The bundled example snapshot](./src/data/seed.json) is a reduced JSON conversion of the Gramps project's example genealogy data, used for development and initial empty-database demonstrations.

- Upstream project: <https://github.com/gramps-project/gramps>
- Upstream example: <https://github.com/gramps-project/gramps/blob/master/data/tests/example.gramps>
- Copyright: the Gramps project and its contributors.
- Upstream license: **GPL-2.0-or-later**. A verbatim copy of the upstream `COPYING` text is included in [LICENSES/Gramps-GPL-2.0.txt](./LICENSES/Gramps-GPL-2.0.txt).
- Local modifications: conversion to Kinship's person/family/event JSON schema and reduction to a smaller example snapshot.

The fixture retains its upstream terms; it is not represented as Kinship's original genealogy data or relicensed by the application's AGPL notice. No browser IndexedDB export is included in this repository.

## Software dependencies

Dependencies are obtained through pnpm and retain their original copyright notices and licenses. In particular, [sac-path-router](https://github.com/leolee9086/sac-path-router) is a separately maintained MIT-licensed package, referenced from a sibling checkout during current development.

The repository does not vendor `node_modules` or generated distribution bundles. Before distributing a built bundle, preserve the applicable dependency license notices with that distribution.
