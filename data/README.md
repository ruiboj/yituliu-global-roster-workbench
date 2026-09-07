# Generated catalog / 生成目录

`operator-catalog.json` is generated and intentionally not tracked by Git.

Run:

```powershell
npm run data:update
```

This downloads public source files, keeps only the fields required by the editor, filters modules against the Global EN availability table, and writes the local catalog. Review `THIRD_PARTY_NOTICES.md` before redistributing a generated snapshot.

`operator-catalog.json` 是本机生成文件，默认不提交到 Git。运行上述命令会下载公开源文件、只保留编辑器所需字段，并通过国际服 EN 数据过滤模组。再分发生成快照前请阅读 `THIRD_PARTY_NOTICES.md`。
