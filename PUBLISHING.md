# Publishing this project

Repository: https://github.com/ruiboj/yituliu-global-roster-workbench

The repository is public. Releases are available to everyone. Keep account data, tokens, and local drafts out of both Git history and release archives.

## Publishing tools

Use Git and GitHub CLI, or GitHub Desktop. Authenticate through the tool’s normal sign-in flow and keep credentials in the operating system credential store. Never put a token in a script or repository file.

In GitHub Desktop, use **File → Add local repository** and select your checkout. Commit changes, then use **Push origin**. If origin is already configured, do not create another repository.

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
git tag -a v3.1.1 -m "v3.1.1"
git push origin v3.1.1
```

The Release workflow creates the source ZIP, Windows portable ZIP, and SHA256SUMS.txt, then uploads them with docs/release-notes.md. Inspect the run and release with `gh run list` and `gh release view v3.1.1`. Check visibility with `gh repo view --json visibility`.

For a first repository creation, use `gh repo create yituliu-global-roster-workbench --private --source . --remote origin --push`. Do not rerun this after origin exists.

## Packaging details

The Windows portable ZIP includes the official Node.js binary and its license, downloaded from nodejs.org and checked against a pinned SHA-256. Update the version and hash together in scripts/package-portable.ps1 when upgrading Node.js. It does not bundle the game catalog or install system-wide dependencies.

The older `-IncludeRuntime` option bundles a generated game catalog. Keep `ALLOW_THIRD_PARTY_DATA_REDISTRIBUTION` unset unless you have the required permission. The regular portable release does not require this option.

See THIRD_PARTY_NOTICES.md for upstream attribution. For screenshots, use a blank or synthetic roster, leave tokens and profile fields empty, and never capture a real account export.
