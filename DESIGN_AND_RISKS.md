# 功能设计与危险边界

本文把每个主要功能为什么存在、会改变什么、不会改变什么写清楚。源码中的高风险入口也有对应注释。

English summary: the local server is loopback-only; tokens stay in page memory; remote writes replace the complete roster; OCR/public data may be wrong or delayed; popularity is not a strength recommendation; ArkPRTS uses unofficial private endpoints; drafts contain personal data; generated third-party catalog data is not covered by this project's MIT license.

## 架构

网页负责解析文件和编辑数据；PowerShell 只做静态文件服务与一图流 HTTPS 代理。服务绑定 `IPAddress::Loopback`，不监听局域网或公网。原因是 Token 应只经过用户浏览器、本机进程和一图流官方后端。

危险性：同一台电脑上的其他本地进程理论上仍能访问回环端口。不要在不可信软件正在运行的电脑上粘贴 Token；用完关闭网页和 PowerShell 窗口。

## Token

只读、只写 Token 分开输入，使用 `password` 控件；不写 localStorage、草稿、日志或 URL。原因是浏览器持久化会扩大泄露面。

危险性：点击“显示”后，旁人或录屏软件可以看到 Token。一图流 Token 具有账号数据权限；怀疑泄露时应立即在一图流更换 Token。

## MAA 导入

MAA 只可靠提供持有、精英、等级、潜能等基础数据，因此采用“按 charId 合并”而非清空专精和模组。原因是 OCR 数据和用户补录数据来源不同。

危险性：OCR 可能识别错。合并后必须核对已持有数量与高练度干员。

## 技能名和模组合法性

中文名称取一图流公开静态表；干员和模组必须同时出现在 EN 静态表中才进入目录。原因是一图流目录跟随国服，国际服会落后。

危险性：公开静态仓库也可能更新延迟。目录外新内容会保留玩家数据并提示更新，但不会猜测模组类型或生成一个可能错误的选择框。

## 推荐专精与模组

专精推荐选择该干员 `skillN[3] / own` 最大的一项；模组推荐选择 `(rank1 + rank2 + rank3) / own` 最大的一项。原因是用户要求“最常用/开启率最高”，该定义可复算、可解释。

危险性：这是玩家投入率，不是技能强度、关卡使用率或攻略评级；老干员、样本偏差和新内容会影响数值。因此按钮只对已持有、精二 60+ 开放，技能和模组分开修改，显示名称与百分比，并且绝不自动批量执行。

## 自动依赖

手动选择专精时补齐持有、精二、技能 7；选择真实存在的模组时补齐持有、精二和四/五/六星的 40/50/60 级门槛。原因是避免向一图流写入游戏中不可能出现的组合。

危险性：自动补齐描述的是逻辑依赖，不代表玩家账号真实拥有这些练度。每次补齐会显示提示，最终仍需用户核对。

## ArkPRTS

网页只解析本地 JSON。独立 Python 导出器使用 ArkPRTS 的只读 Client，随后立刻丢弃除干员进度和基本资料外的所有原始字段。原因是把非官方账号访问与常规编辑器隔离，并最小化落盘数据。

危险性：ArkPRTS 直接访问 Yostar 私有游戏接口，不是官方第三方 API；可能让当前游戏会话掉线，可能因接口变化停止工作，也可能存在服务条款风险。工具不自动安装依赖、不代替用户确认、不保存 Token，也不使用 AutomationClient。MAA 仍是默认路径。

## 草稿

草稿包含写入资料和练度，不包含 Token。原因是写入为整体替换，用户需要可恢复备份。

危险性：UID、昵称和练度仍属于个人数据。不要公开分享草稿；如需问题排查，应先移除 `profile` 和不必要的干员记录。

## 一图流写入

写入前检查 UID、空列表、字段范围、技能/模组存在性和依赖；再展示不可绕过的整体替换确认。上传负载只含 `own === true` 的干员。

危险性：接口语义由一图流后端决定，未来可能改变。任何本地检查都不能替代写入后的只读回读核对。

## 中英文切换

界面使用一个很小的会话内语言状态，而不是引入框架或把偏好写入浏览器存储。原因是保持代码可审计，并避免在含 Token 的工具旁边增加不必要的持久化。

危险性：干员、技能和模组名称来自中文数据源，因此英文界面仍可能显示中文游戏内名称。英文切换只翻译工具标签、提示、检查结果和风险说明，不应被理解为官方本地化。

## GitHub 发布与第三方数据

GitHub 源码发布默认排除生成的 `data/operator-catalog.json`，CI 在临时环境重新下载并生成。原因是数据源公开可访问，但一图流前端和 ArknightsAssets 数据集目前没有清晰的常规再分发授权。

危险性：本项目 MIT 许可证只能覆盖原创代码和发布者有权许可的 UI 样式，不能替第三方授予游戏名称、数据或商标权。预构建运行包会包含生成目录，所以 Release 工作流要求维护者显式设置许可确认变量；没有确认时只生成纯源码包。

## 3.1 Portable Windows launch

Start.cmd uses a bundled official Node.js binary only to fetch and transform public data when the local catalog is missing. It then starts the existing loopback PowerShell server, which opens the browser. The command window remains visible so users can see errors and close the service. Update-catalog.cmd refreshes the catalog explicitly. The first download needs internet; later editing can use the saved catalog. No security settings or machine-wide runtimes are changed. Downloaded scripts may still trigger Windows warnings.
