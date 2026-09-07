# Publishing this project

Repository: https://github.com/ruiboj/yituliu-global-roster-workbench

Keep the repository **private** until you deliberately decide to change its visibility. Releases inherit repository access; uploading a release does not make it public.

## Tools on this computer

Git and GitHub Desktop were already installed. GitHub CLI is installed through WinGet and uses the existing GitHub credential for ruiboj, held in the Windows credential store. Never put a token in a script or repository file.

The publishing checkout is `D:\Repos\Arknights temp tool\yituliu-global-roster-workbench`. In GitHub Desktop, use **File → Add local repository** and select that folder. Commit changes, then use **Push origin**. The repository has its origin configured; do not create another repository from the research folder.

## Prepare a release

1. Update package.json, CHANGELOG.md, download filenames in both READMEs, and docs/release-notes.md.
2. Run the following with Node.js installed:

```powershell
npm run data:update
npm test
npm run release:portable
```

3. Extract the Windows ZIP into a fresh folder and run Start.cmd. Confirm first-launch download, browser opening, import, editing, draft download, and restore. Keep real account data out of tests and screenshots.
4. Review `git diff` and `git status`. Generated catalogs, releases, runtime binaries, drafts, exports, and credentials must not be tracked.
5. Commit and push main. Wait for CI to pass before tagging:

```powershell
git tag -a v3.1.0 -m "v3.1.0"
git push origin v3.1.0
```

The Release workflow creates the source ZIP, Windows portable ZIP, and SHA256SUMS.txt, then uploads them with docs/release-notes.md. Inspect the run and release with `gh run list` and `gh release view v3.1.0`. Check visibility with `gh repo view --json visibility`.

For a first repository creation, use `gh repo create yituliu-global-roster-workbench --private --source . --remote origin --push`. Do not rerun this after origin exists.

## Packaging details

The Windows portable ZIP includes the official Node.js binary and its license, downloaded from nodejs.org and checked against a pinned SHA-256. Update the version and hash together in scripts/package-portable.ps1 when upgrading Node.js. It does not bundle the game catalog or install system-wide dependencies.

The older `-IncludeRuntime` option bundles a generated game catalog. Keep `ALLOW_THIRD_PARTY_DATA_REDISTRIBUTION` unset unless you have the required permission. The regular portable release does not require this option.

See THIRD_PARTY_NOTICES.md for upstream attribution. For screenshots, use a blank or synthetic roster, leave tokens and profile fields empty, and never capture a real account export.
