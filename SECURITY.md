# Security policy / 安全策略

## Supported version

Only the latest release is supported.

## Reporting a vulnerability

Do not open a public issue if a report contains a token, verification code, UID-linked private data, a raw account response, or a way to expose another user's roster. This repository is currently private. Contact the owner through an existing private channel; an issue is visible to everyone with repository access. If private vulnerability reporting is enabled after a public release, use that feature. Revoke or rotate exposed tokens before contacting maintainers.

如果报告包含 Token、验证码、与 UID 关联的隐私数据、原始账号响应，或可读取他人练度的方法，请不要创建公开 Issue。仓库目前私有，请通过已有私密渠道联系维护者；Issue 对所有仓库成员可见。公开发布并启用私密漏洞报告后，可使用该功能，并先撤销或更换已泄露 Token。

Include only a minimal reproduction with synthetic data. Never send real Yostar credentials or raw `syncData`.

## Security boundaries

- The server must listen only on loopback (`127.0.0.1`).
- Tokens remain in page memory and request bodies; they must not enter logs, URLs, drafts, or browser storage.
- Whole-roster writes require an explicit review and confirmation.
- ArkPRTS is experimental, optional, and outside the project's security guarantee because it uses private game endpoints.
