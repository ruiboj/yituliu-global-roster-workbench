# Security policy / 安全策略

## Supported version

Only the latest release is supported.

## Reporting a vulnerability

Do not open a public issue if a report contains a token, verification code, UID-linked private data, a raw account response, or a way to expose another user's roster. Use [GitHub private vulnerability reporting](https://github.com/ruiboj/yituliu-global-roster-workbench/security/advisories/new). Revoke or rotate exposed tokens before contacting maintainers.

如果报告包含 Token、验证码、与 UID 关联的隐私数据、原始账号响应，或可读取他人练度的方法，请不要创建公开 Issue。请使用 [GitHub 私密漏洞报告](https://github.com/ruiboj/yituliu-global-roster-workbench/security/advisories/new)，并先撤销或更换已泄露 Token。

Include only a minimal reproduction with synthetic data. Never send real Yostar credentials or raw `syncData`.

## Security boundaries

- The server must listen only on loopback (`127.0.0.1`).
- Tokens remain in page memory and request bodies; they must not enter logs, URLs, drafts, or browser storage.
- Whole-roster writes require an explicit review and confirmation.
- ArkPRTS is experimental, optional, and outside the project's security guarantee because it uses private game endpoints.
