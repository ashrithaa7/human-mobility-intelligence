# Push the completed source to GitHub

Target: https://github.com/ashrithaa7/human-mobility-intelligence

The repository was empty when inspected. The connected GitHub account had read access only, so no push was performed. The owner requested commands to run locally instead. Run these from PowerShell after signing in to GitHub through your normal Git credential manager. Do not put a token or database password in a command, remote URL or committed file.

## First push from this project folder

```powershell
Set-Location C:\Projects\HumanMobilityIntelligence\mobility-intelligence
node tools/check-repository.cjs
if ($LASTEXITCODE -ne 0) { throw 'Repository checks failed; do not publish yet.' }
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Add mobility intelligence app, Hyderabad planning workspace and team documentation"
git remote add origin https://github.com/ashrithaa7/human-mobility-intelligence.git
git push -u origin main
```

Review the staged file list before the commit. It should contain source, lockfiles, migrations, tools and documents. It must not contain `.env` files, credentials, account snapshots, raw datasets, databases, backups, dependency folders or build artifacts. The check compares known local secrets and excludes runtime artifacts, but is not a general security audit.

If Git asks for author identity, set your own name and email with `git config user.name` and `git config user.email`, then repeat the commit. If this folder has already been initialised by the time you run these commands, skip `git init`; inspect `git remote -v` before adding a remote. If `origin` already points elsewhere, intentionally set it with `git remote set-url origin` using the target URL above.

Do not force-push if Git reports that the remote now has commits. Fetch and review those changes first, then integrate them without discarding teammates' work. The commands above assume the newly created empty remote that was inspected during this task.

## What teammates do after cloning

1. Read `README.md` and `docs/PROJECT_STORY_AND_FLOW.md`.
2. Install dependencies and configure their environment using `docs/SETUP.md`; secrets are shared through an authorised private channel, never the repository.
3. Create/configure Supabase and apply migrations in order, or use an authorised shared project.
4. Download and prepare data using `docs/HYDERABAD_DATA_CATALOG.md`; import the public mobility source through the administrator workflow.
5. Run both services and follow `docs/TESTING.md`.

GitHub hosts the source and documentation. Pushing does not deploy the running website or copy the local Supabase configuration, datasets or saved briefs.
