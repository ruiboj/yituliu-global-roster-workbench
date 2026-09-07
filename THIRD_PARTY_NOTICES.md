# Third-party notices / 第三方说明

The MIT license in this repository covers only original project code and the publisher-owned Neon Orange Workbench styling. It does not grant rights to Arknights names, game data, third-party datasets, APIs, or trademarks.

本仓库的 MIT 许可证只覆盖原创代码和发布者拥有的 Neon Orange Workbench 样式，不授予《明日方舟》名称、游戏数据、第三方数据集、API 或商标的任何权利。

## Arknights / 明日方舟

Arknights and related game content belong to their respective rights holders, including Hypergryph and regional publishers such as Yostar. This is an unofficial, non-commercial fan utility and is not endorsed by or affiliated with them.

《明日方舟》及相关游戏内容归鹰角网络及包括 Yostar 在内的各地区权利方所有。本项目是非官方、非商业同人工具，与上述公司没有从属或背书关系。

## Public data adapters / 公共数据适配

- [Arknights-yituliu/frontend-v2-plus](https://github.com/Arknights-yituliu/frontend-v2-plus): Chinese display names and operator metadata.
- [Yituliu public statistics endpoint](https://backend.yituliu.cn/survey/operator/result/v2): aggregated progression statistics.
- [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata): Global-server availability IDs.

At the time of review, the first repository's `LICENSE` file did not contain a conventional license grant, and the ArknightsAssets data repository did not expose an explicit dataset license. Public availability is not permission to redistribute. Therefore `data/operator-catalog.json` is generated locally, excluded by `.gitignore`, and is not covered by this project's MIT license.

核对时，一图流前端仓库的 `LICENSE` 并未给出常规许可授权，ArknightsAssets 数据仓库也未公开明确的数据集许可证。公开可访问不等于允许再分发。因此 `data/operator-catalog.json` 默认在本机生成、被 `.gitignore` 排除，且不属于本项目 MIT 许可范围。

Before attaching a prebuilt runtime containing the generated catalog to a public GitHub release, the maintainer must confirm that redistribution is permitted. Otherwise publish the code-only source package and ask users to run `npm run data:update` locally.

公开发布包含生成目录的预构建运行包之前，维护者必须确认拥有再分发权限；否则只发布纯源码包，并让用户在本机运行 `npm run data:update`。

## ArkPRTS

[ArkPRTS](https://github.com/ashleney/ArkPRTS) is an optional GPL-3.0 dependency installed separately by the user. It is not vendored into this repository. Users who install or redistribute ArkPRTS must comply with its license. Its private game-server access is experimental and may carry account or terms-of-service risk.

ArkPRTS 是用户单独安装的可选 GPL-3.0 依赖，本仓库不内置该项目。安装或再分发者需遵守其许可证；其私有游戏接口访问具有实验性，并可能带来账号或服务条款风险。

## Bundled Node.js

The Windows portable ZIP includes the official Node.js 22.23.2 Windows x64 binary from nodejs.org. Its complete license and dependency notices are included as runtime/NODE-LICENSE.txt. The download is checked against the pinned official SHA-256 before packaging. No npm packages or ArkPRTS dependency are bundled. The portable ZIP downloads game data on first use; it does not redistribute a catalog snapshot.
