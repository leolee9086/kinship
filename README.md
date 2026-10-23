# Kinship

一个以焦点为中心、键盘优先的通用概念关系编辑器。家谱是其中一个阅读视角；人物、地点、事件、组织、文献、类型、角色和具体关系都使用 UUID 概念身份。

**在线 demo：[leolee9086.github.io/kinship](https://leolee9086.github.io/kinship/)**。演示数据保存在当前浏览器的 IndexedDB；可以直接编辑，刷新后继续，其他访客不会看到你的修改。站点更新不覆盖已保存工作区。

## 当前能力

- 顶栏可切换、新建和重命名项目；各项目的概念、设置、媒体和历史独立，重新打开时恢复上次项目与焦点。
- 概念编辑弹窗支持 Tab / Shift+Tab 循环导航；单行 Enter 前往下一项，说明与 JSON 编辑保留换行，选择框和折叠项使用原生键盘操作。Ctrl / ⌘+Enter 保存，Esc 关闭后回到入口；中文输入法组合期间不触发这些快捷键，保存中锁定表单。
- 概念详情的“正文”以有序文件接入两种编辑器：修改版 Vditor 编辑 `text/x-kramdown`，整区段显式保存；CodeMirror 6 + Yjs 编辑 `text/plain`，完整块内 CRDT 自动同步。区段有稳定 UUID，可新增、排列及分栏；解除布局保留文件。不同区段独立提交，同一整文件冲突保留草稿。完整 Protyle / BlockSuite 能力仍按矩阵推进。
- 全局操作集中在顶栏，导入、编辑历史与帮助位于“更多”；画布只保留视角、焦点和缩放，“展示”侧栏按显示、布局、背景分页。
- 关系拥有带 UUID 的参与槽，每个槽引用角色概念和参与概念；支持多人关系、关系参与另一关系，同一对概念可有多条独立关系。
- 二元关系可以选中为线、展开成节点或直接聚焦；多人关系保留枢纽，展开和压缩不创建新事实。
- 概念详情可遗忘、恢复和撤销：UUID、内容及全部参与槽保留；普通目录排除遗忘对象，可切到“已遗忘”或“全部”检索找回。含遗忘参与者的事实完整收起，嵌套关系也按参与引用收起，恢复后重新投影。
- 概念详情的“检查删除影响…”先列出引用与导航清理项，再明确确认；引用阻止删除，不级联移除关系。历史和 UUID 墓碑保留。
- **视角决定看什么**：可新建、复制、重命名和删除；族谱、协作、事件、全部关系是新工作区的起始模板。分类可设为主轴、淡显、收进“相关”或隐藏，子分类继承最近规则。主轴先参与遍历和布局，淡显只补充背景，“相关”可临时展开。
- **视图决定怎样画**：上下左右方向规则、四个方向独立的文字框边缘间距、颜色轴与区分深度、调色板、曲线和背景。
- 方向规则相对当前焦点读取。连线根据两端实际位置选择端口；配偶等对称关系不依赖参与槽录入顺序。角色显示在线上靠近所属参与者的位置。
- 淡显概念和关系仍可用鼠标、触屏直接点击，方向键导航只选择主轴概念。聚焦淡显或非主轴概念时，焦点始终可见。
- 图片和简单视频背景通过上传资源接口保存；支持重载、清除、强度、模糊和视频暂停。视频静音循环，在后台或系统要求减少动画时暂停。单文件最大 100 MiB。
- PixiJS 保留平滑聚焦、平移、缩放、视口裁剪和小地图；移动端使用概念库抽屉、单指平移与双指缩放。

“更多 → 编辑历史”按冻结的工作区修订分页审阅可信编辑者、事件、命令与导入来源；选中单个概念后按需读取归档保存的完整前后值，保留 UUID 和参与槽，不把个人导航或媒体字节泄露到共享历史。历史界面当前为只读；删除后的版本恢复预览与新命令恢复仍未实现。界面只显示预算内邻域；规模测试不等于同时渲染十万节点。

## 数据与边界

所有业务数据、持久设置和媒体操作只有一条路径：

```text
React UI → ProjectAdapter / DataAdapter → typed POST RPC → internal fetch → schema / domain validation → ProjectRepository / GraphRepository → IndexedDB
```

UI 不直接访问数据库。当前 `/rpc/v1/` 契约包含工作区快照、原子命令、命令状态、分页事件和媒体。请求与响应用同一套严格 JSON Schema 校验，类型从模式推导。资源有独立版本；可信编辑者、业务变化、幂等命令结果、恢复前值和事件在同一事务中保存。同一命令 ID 与内容可跨连接、重开数据库后重放；ID 换内容或版本过时会明确拒绝。个人焦点与导航单独持久化，不广播到共享事件。源码入口：[契约注册表](./src/contracts/rpc.ts)、[标准模式目录](./src/contracts/catalog.ts)、[事务执行](./src/backend/commandTransaction.ts)。

数据库是主事实来源。项目目录 `kinship-projects` v1 保存项目 UUID、名称、版本、当前选择和持久命令结果；`POST /rpc/v1/projects/list` 读取，`POST /rpc/v1/projects/apply` 原子创建/选择/版本化重命名，拥有独立 `catalogId` 上下文。目录初建只把当前 `kinship-workspaces` 登记为“我的图谱”，不复制或重新填充其中的数据；明确新建的项目使用独立 `kinship-project-<UUID>` 图谱库，提供词汇与通用展示模板，不含演示关系。项目 UUID 与图谱 workspaceId 分开；每个打开的 DataAdapter 固定到该项目，切换不会改变已发出写请求的目标。项目契约见[项目注册表](./src/contracts/projects.ts)，本地装配见[项目服务](./src/composition/localProjects.ts)。

每个图谱库仍是 IndexedDB v1，分别保存概念、共享展示定义、个人视图状态、媒体、身份墓碑、命令结果和事件。新工作区从版本化 JSON [词汇模板](./src/templates/starter-vocabulary.json)、[演示模板](./src/templates/starter-demo.json)和[展示模板](./src/templates/starter-presentation.json)初始化，模板中的概念与槽位身份都是 UUID；随后只读取数据库中的已保存记录，更新模板不会重新填充已有工作区。开发阶段不保留旧结构兼容、双写或隐式导入；不读取、不迁移、不删除 `kinship`、`kinship-concepts`、`kinship-workspace` 等旧开发库。不同域名、端口或浏览器配置使用各自的站点存储。

概念编辑按字段差异提交，参与槽按 UUID 添加、修改、移动和移除；视图/视角定义与个人状态也有独立操作，不提供整对象 replace 入口。同一事务内可组合多个字段与槽位变更，统一检查原始资源版本，每个资源只递增一次。相关入口：[概念与槽位操作](./src/contracts/conceptOperations.ts)、[设置操作](./src/contracts/settingsOperations.ts)、[最终图校验](./src/backend/commandPlan.ts)。

概念集合文件的[严格校验和规范输出](./src/format/concepts.ts)接受显式提供的依赖，以 UUID 校验引用、重复身份和槽位。五个通用语义根由内核识别，其余人物、角色和领域分类都属于模板内容，未被引用的模板分类可以正常删除。赋色支持关系分类、第一/第二参与角色及前两角色对，按各自分类路径和深度计算；多继承按 UUID 选择确定路径。旧开发枚举 `parent-role` / `child-role` 已移除，不转换或回退为新轴。

概念详情可**预览并下载局部 JSON 图谱包**：选当前概念/关系作为入口，带必要定义，选择补齐参与对象或保留外部 UUID 引用。完整关系的全部参与槽原样保留，嵌套关系按出向引用补齐，不扩展参与者的其他关系。`entrypoints`、`selected`、`dependencies`、`externals`、来源修订和覆盖声明均明确，逐记录 SHA-256 摘要在客户端再次校验。默认上限 1000 条概念、1 MiB，超预算明确报错；图谱包 spec 2 包含概念、关系及其完整正文，覆盖声明为 `documents: "concept-bodies"`；媒体、展示和历史明确未包含。旧 spec 1 不隐式转换。入口是 `DataAdapter.exportGraph → POST /rpc/v1/graph/export`，不会在 UI 中直接读取数据库。契约见[图谱包模式](./src/contracts/graphPackage.ts)，闭包规则见[局部选择](./src/domain/packageSelection.ts)。

顶栏 **更多 → 导入图谱包** 可上传最多 1 MiB 的 JSON 图谱包。文件通过 `DataAdapter → multipart POST /rpc/v1/graph/import/file` 交给后端检查字节摘要、UTF-8 和文件契约；UI 不自行解析文件。预览按 UUID 区分新增、相同、内容冲突和身份不可用，冲突可展开比较字段，再逐项保留目标或采用包内完整内容。缺失的外部 UUID、身份墓碑和槽位碰撞阻止提交；外部对象内容变化须明确接受目标版本，不按名称猜匹配。可通过 `POST /rpc/v1/graph/import/preview` 重新核对。

确认导入经 `POST /rpc/v1/graph/import/apply`，在同一严格事务保存事实、资源版本、编辑者、前值、来源包身份/摘要/修订和幂等结果。预览后的共享写会使整个导入明确过期；最多 128 个原子操作，超额报错，不分批截断。完整相同的导入不递增共享修订。来源版本不充当目标版本；重开数据库或并发重放同一命令不会重复创建记录。提交结果不明时表单保留原命令与内容供重试；未包含的对象、媒体、展示和历史不会删除；明确选择采用包内概念时，也采用其完整正文（包括正文缺省），冲突对比显示正文块树。入口见[导入契约](./src/contracts/importPreview.ts)、[差异规划](./src/domain/importCommands.ts)、[导入事务](./src/backend/importTransaction.ts)。

删除通过 `DataAdapter.previewDelete → POST /rpc/v1/concepts/delete/preview` 只读核对类型、上级、参与槽、角色数量约束、所有视图/视角和已保存导航。返回完整清单最多 2000 项、1 MiB，超额明确失败；界面每页显示 50 项。`POST /rpc/v1/concepts/delete/apply` 要求预览时的空间修订、概念版本和当前人的状态版本；自己的焦点/展开项可在同一事务清理，其他引用须先处理。底层原子删除也检查全部已保存状态，不允许绕过。只移除目标当前记录，历史前值与墓碑保留；错误目标/版本的回包视为结果不明，重试保持原命令。当前尚未提供删除后的历史恢复界面。契约见[删除模式](./src/contracts/deletion.ts)，引用规则见[删除引用](./src/domain/deletionReferences.ts)，执行见[删除事务](./src/backend/deletionTransaction.ts)。

遗忘/恢复经 `DataAdapter.setForgotten → POST /rpc/v1/commands/apply` 的 `concept.forget` / `concept.restore` 原子操作，要求目标概念版本。`forgotten: true` 是唯一遗忘标记，恢复移除此标记；内容、身份与引用不变，通用语义根受保护。操作和撤销都追加带作者/前值的历史。普通编辑保留标记，导入按 UUID 显示生命周期冲突并明确选择。提交结果不明时锁定原 UUID、版本与命令 ID 重试，版本冲突可重新读取项目再审阅。明确打开的遗忘焦点自身仍可查看；类型/角色的分类效力保留，不连带改变实例状态。引用详情照常读取完整事实。规则见[生命周期探索](./src/domain/lifecycle.ts)，动作入口见[生命周期交互](./src/ui/useConceptLifecycle.ts)。

历史读取经 `DataAdapter.historyList → POST /rpc/v1/history/list`（倒序1–50条、上界修订与工作区作用域游标）和 `DataAdapter.historyConcept → POST /rpc/v1/history/concept`（事件UUID+概念UUID）。前后值来自追加归档；后续改名或删除不改变历史。每次响应最多1MiB，超预算明确报错，可调低条数；不静默截断。适配器再次核对完整连续修订、目标身份、版本、分页游标与详情对应事件。翻页返回仍保持原上界，显式“读取最新记录”才纳入后续提交。契约见[历史模式](./src/contracts/history.ts)，存储读取见[历史查询](./src/backend/historyQuery.ts)，界面见[历史审阅](./src/ui/HistoryReview.tsx)。目前展示概念的前后值，共享展示和媒体显示变更统计；未开放私人导航历史。

正文采用[有序文件与布局契约](./src/contracts/document.ts)：普通内容文件没有通用 `children` 或 AST；布局文件把成员 UUID 列表保存在其自己的 JSON 文本中，主体只读取校验投影。默认 `text/x-kramdown` 由单独 fork 的 Vditor 源编辑模式处理完整文件读写，`text/plain` 由 CodeMirror 6 + Yjs 处理块内全部 CRDT 更新和本地 Undo。适配器只接受本文件句柄、文章内序号和 DOM 生命周期，拿不到主体版本、UUID、权限、图谱、路由或数据库。主体负责文件归属、权限、版本、布局拓扑和边界校验；[文件专用计划](./src/backend/planDocument.ts)沿唯一 `DataAdapter → RPC → IndexedDB` 命令路径提交，历史、幂等结果和块墓碑同事务保存。整篇结构 CAS 只能排列、新增或移除文件，不能改写任何已有文件；完整文本使用文件独立版本 CAS，同一区段冲突保留草稿；完整 CRDT 使用不透明二进制状态。固定 Vditor 来源和许可证见[依赖来源](./vendor/README.md)。

当前 bootstrap、导出、导入预览和删除核对仍读取完整概念快照，业务图编辑仍执行全图约束检查。已交付两个可运行区段适配器、区段独立版本与块内 CRDT；仍未交付大文档分页、Kramdown 文本分隔符的完整导入/导出、语义关系扩展、全部 Protyle / BlockSuite 块和操作、SQLite 容器、历史恢复界面、WebSocket 或 Supabase。现有 JSON 图谱包可往返当前正文（含区段文件状态）；媒体、展示和完整历史仍不属于该包的覆盖范围。后续 Rust 或远端后端复用协议契约并替换 transport/存储实现。

浏览器已验证同源两个页面间的同步与仅撤销本地来源、whole-file 冲突保留草稿，以及自定义 IAL、围栏内分隔符、NBSP 和尾空行的保存/重开。跨页面通知与定期 RPC 读取共用当前浏览器库，这不代表已经部署跨设备协作服务。正文结构当前仍是 CAS；顺序 CRDT、生效位置寄存器、并发移动收敛与结构 Undo 列为后续正文结构协作阶段。分栏重建和关闭前由生命周期守卫阻止丢弃未保存文本或未确认的 CRDT 更新；围栏外的分割线紧邻 IAL、或未闭合围栏会拒绝保存，保留本地文本。

项目设计和开发记录在思源维护：[编辑器、语义内链与原子 RPC 方案](siyuan://blocks/20261023012229-e9zn1zp)、[RPC 契约与事务协议](siyuan://blocks/20261023032258-aa34xhy)、[JSON/Kramdown 与局部图谱包设计](siyuan://blocks/20261023025308-dv16evk)、[开发进度和验收记录](siyuan://blocks/20261023011959-53mrjex)。

## 开发

使用 pnpm。路由依赖当前以 `file:../sac-path-router` 引用同级项目，包含标准 FormData/Blob 请求体支持：

```sh
git clone https://github.com/leolee9086/sac-path-router.git
git clone https://github.com/leolee9086/kinship.git
cd sac-path-router
pnpm install
pnpm build
cd ../kinship
pnpm install --frozen-lockfile
pnpm dev
```

开发地址为 `http://localhost:5273/`，端口设置见 [Vite 配置](./vite.config.ts)。

```sh
pnpm test       # 语义投影、几何路由、内部请求、隔离 IndexedDB 和媒体持久化
pnpm typecheck  # 严格 TypeScript 检查
pnpm build      # 类型检查与生产构建
pnpm preview    # 预览生产构建
```

## Demo 发布

[Pages 工作流](./.github/workflows/pages.yml)在 `main` 推送后自动运行，也可从 Actions 手动触发。工作流检出固定提交的同级路由项目，使用 pnpm 锁文件安装、测试并构建，通过 Pages 配置生成正确的子目录资源路径；只有检查通过的构建才部署。更新路由依赖时同步调整工作流中的提交固定值。

## 操作

|操作|入口|
|---|---|
|搜索概念|`/`，支持名称、别名、说明和类型；目录可筛选当前、已遗忘或全部|
|沿主轴切换焦点|方向键；跳过淡显概念|
|编辑焦点|`Enter`|
|创建概念 / 关系|`N` / `R`|
|返回上一焦点|`Backspace`|
|帮助 / 关闭面板|`?` / `Esc`|
|检查关系概念|点击关系线，在详情中选择“作为焦点”或展开为节点|
|平移 / 缩放|拖拽 / 滚轮；触屏单指 / 双指|

演示中可以找到父子兼同僚、三人协作、会议参与、会议地点、机构成员和文献引用关系实例。它们用于展示结构，不代表真实人物与历史事实。

## 许可证

原创代码采用 **GNU Affero General Public License v3.0 or later**，SPDX：**AGPL-3.0-or-later**。完整协议见 [LICENSE](./LICENSE)，声明见 [NOTICE](./NOTICE)，第三方说明见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。源码仓库不包含个人家谱、浏览器数据库导出或本地工作笔记。
