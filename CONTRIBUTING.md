# Team workflow

Start with [README.md](README.md), follow [local setup](docs/SETUP.md), then read [architecture](docs/ARCHITECTURE.md) and [current status](docs/PROJECT_STATUS.md). Work from the project directory containing `frontend` and `backend`.

## Keep measurements honest

Preserve source provenance and limitations. Scheduled GTFS trips are not passengers; source row counts are not population; route estimates are not live traffic. When a schema cannot support an analysis, explain why and show supported alternatives instead of adding placeholders or invented values.

Keep real backend processing behind charts and report recommendations. Avoid client-side constants that appear to be computed statistics. Add a small fixture when introducing a new format or measurement, including invalid-input cases.

## Preserve workflows

- Keep the current gradient/surface system and responsive layouts. Scope map positioning and resize behavior to the map component.
- Keep active-source selection explicit and retain the previous source after failed import.
- Use the active database profile for roles. Do not grant privileges through client metadata, historical request state or UI checks alone.
- Review requests through the transactional RPC. Keep audit/history and concurrent duplicate prevention.
- Treat public data access and shared planner reports as explicit boundaries. A private-data feature needs a separate authorization/storage design.

## Changes and validation

For backend logic, run relevant pytest tests and the full suite before handing off. For UI changes, run type checking/build plus a browser check at desktop/mobile widths. For SQL permissions or request-state changes, run the isolated PostgreSQL tests and inspect existing live policies before migration. See [TESTING.md](docs/TESTING.md).

Use new ordered migrations for future deployed schema changes instead of rewriting an already applied migration. Review any data transitions and preserve existing identities/roles. Do not seed real credentials or automatically promote the first web registrant.

Record user-facing behavior, validation and limitations in the relevant docs. A change description should explain the trigger/problem, resulting behavior, and evidence; avoid calling fixture-based tests a real-user email/login test.

## Sharing the repository

Commit code, small fixtures, migrations, dependency manifests/lockfiles, and documentation. Keep runtime source files, downloaded archives, credentials, catalogs, logs and local backups out. Run `node tools/check-repository.cjs` with ripgrep installed and review the intended file list before pushing.

Choose the repository's distribution license deliberately; none is currently declared. External datasets, fonts and map providers retain their own terms and attribution requirements. Do not assume availability of a dataset on a workstation grants redistribution rights.
