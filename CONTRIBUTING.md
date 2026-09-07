# Contributing / 参与贡献

Thank you for helping international-server players. Keep changes small, auditable, and safe around credentials.

感谢帮助国际服玩家。涉及凭据时，请保持改动小、可审计，并优先保护用户数据。

## Ground rules / 基本规则

- Never include tokens, verification codes, raw `syncData`, personal drafts, or real account exports in issues, commits, tests, or screenshots.
- Do not add account automation. ArkPRTS support is limited to an explicit, read-only, opt-in export path.
- Keep the local server bound to `127.0.0.1`; do not widen it to LAN/public interfaces.
- A mastery recommendation must remain a descriptive popularity statistic, not a strategy or strength claim.
- A module control must be backed by the current Global availability allowlist.
- Do not commit `data/operator-catalog.json`; generate it locally with `npm run data:update`.

## Development / 开发

```powershell
npm run data:update
npm test
```

Submit focused pull requests. Explain the user problem, safety impact, test evidence, and whether public-data fields or upload behavior changed.

请提交聚焦的 Pull Request，并说明用户问题、安全影响、测试证据，以及是否改变了公共数据字段或上传行为。
