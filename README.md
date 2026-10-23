# Kinship

一个以焦点为中心、键盘优先的通用概念关系编辑器。家谱是其中一个阅读视角；人物、地点、事件、组织、文献、类型、角色和具体关系都使用 UUID 概念身份。

**在线 demo：[leolee9086.github.io/kinship](https://leolee9086.github.io/kinship/)**。演示数据保存在当前浏览器的 IndexedDB；可以直接编辑，刷新后继续，其他访客不会看到你的修改。站点更新不覆盖已保存工作区。

## 当前能力

- 关系拥有带 UUID 的参与槽，每个槽引用角色概念和参与概念；支持多人关系、关系参与另一关系，同一对概念可有多条独立关系。
- 二元关系可以选中为线、展开成节点或直接聚焦；多人关系保留枢纽，展开和压缩不创建新事实。
- **视角决定看什么**：可新建、复制、重命名和删除；族谱、协作、事件、全部关系是新工作区的起始模板。分类可设为主轴、淡显、收进“相关”或隐藏，子分类继承最近规则。主轴先参与遍历和布局，淡显只补充背景，“相关”可临时展开。
- **视图决定怎样画**：上下左右方向规则、四个方向独立的文字框边缘间距、颜色轴与区分深度、调色板、曲线和背景。
- 方向规则相对当前焦点读取。连线根据两端实际位置选择端口；配偶等对称关系不依赖参与槽录入顺序。角色显示在线上靠近所属参与者的位置。
- 淡显概念和关系仍可用鼠标、触屏直接点击，方向键导航只选择主轴概念。聚焦淡显或非主轴概念时，焦点始终可见。
- 图片和简单视频背景通过上传资源接口保存；支持重载、清除、强度、模糊和视频暂停。视频静音循环，在后台或系统要求减少动画时暂停。单文件最大 100 MiB。
- PixiJS 保留平滑聚焦、平移、缩放、视口裁剪和小地图；移动端使用概念库抽屉、单指平移与双指缩放。

当前仍是开发原型。Rust 服务、来源争议工作流、引用分身和完整图库服务端查询尚未实现。界面只显示预算内邻域；规模测试不等于同时渲染十万节点。

## 数据与边界

所有业务数据、持久设置和媒体操作只有一条路径：

```text
React UI → DataAdapter → typed POST RPC → internal fetch → schema / domain validation → GraphRepository → IndexedDB
```

UI 不直接访问数据库。当前 `/rpc/v1/` 契约包含工作区快照、原子命令、命令状态、分页事件和媒体。请求与响应用同一套严格 JSON Schema 校验，类型从模式推导。资源有独立版本；可信编辑者、业务变化、幂等命令结果、恢复前值和事件在同一事务中保存。同一命令 ID 与内容可跨连接、重开数据库后重放；ID 换内容或版本过时会明确拒绝。个人焦点与导航单独持久化，不广播到共享事件。源码入口：[契约注册表](./src/contracts/rpc.ts)、[标准模式目录](./src/contracts/catalog.ts)、[事务执行](./src/backend/commandTransaction.ts)。

数据库是主事实来源。当前站点使用 `kinship-workspaces` IndexedDB v1，分别保存概念、共享展示定义、个人视图状态、媒体、身份墓碑、命令结果和事件。新工作区从版本化 JSON [词汇模板](./src/templates/starter-vocabulary.json)、[演示模板](./src/templates/starter-demo.json)和[展示模板](./src/templates/starter-presentation.json)初始化，模板中的概念与槽位身份都是 UUID；随后只读取数据库中的已保存记录，更新模板不会重新填充已有工作区。开发阶段不保留旧结构兼容、双写或隐式导入；不读取、不迁移、不删除 `kinship`、`kinship-concepts`、`kinship-workspace` 等旧开发库。不同域名、端口或浏览器配置使用各自的站点存储。

概念编辑按字段差异提交，参与槽按 UUID 添加、修改、移动和移除；视图/视角定义与个人状态也有独立操作，不提供整对象 replace 入口。同一事务内可组合多个字段与槽位变更，统一检查原始资源版本，每个资源只递增一次。相关入口：[概念与槽位操作](./src/contracts/conceptOperations.ts)、[设置操作](./src/contracts/settingsOperations.ts)、[最终图校验](./src/backend/commandPlan.ts)。

概念集合文件的[严格校验和规范输出](./src/format/concepts.ts)接受显式提供的依赖，以 UUID 校验引用、重复身份和槽位。五个通用语义根由内核识别，其余人物、角色和领域分类都属于模板内容，未被引用的模板分类可以正常删除。赋色支持关系分类、第一/第二参与角色及前两角色对，按各自分类路径和深度计算；多继承按 UUID 选择确定路径。旧开发枚举 `parent-role` / `child-role` 已移除，不转换或回退为新轴。

概念详情可**预览并下载局部 JSON 图谱包**：选当前概念/关系作为入口，带必要定义，选择补齐参与对象或保留外部 UUID 引用。完整关系的全部参与槽原样保留，嵌套关系按出向引用补齐，不扩展参与者的其他关系。`entrypoints`、`selected`、`dependencies`、`externals`、来源修订和覆盖声明均明确，逐记录 SHA-256 摘要在客户端再次校验。默认上限 1000 条概念、1 MiB，超预算明确报错；仅导出概念与关系，正文、媒体、展示和历史明确未包含。入口是 `DataAdapter.exportGraph → POST /rpc/v1/graph/export`，不会在 UI 中直接读取数据库。契约见[图谱包模式](./src/contracts/graphPackage.ts)，闭包规则见[局部选择](./src/domain/packageSelection.ts)。

当前 bootstrap 与导出取数仍读取完整概念快照，业务图编辑仍执行全图约束检查；分页目录、后端局部投影、生命周期与历史回滚界面、图谱包导入、SQLite 容器、正文编辑器、Kramdown 编解码、WebSocket 和 Supabase 尚未交付。JSON/Kramdown/SQLite 文件作为显式导入导出目标，普通导入将保留 UUID；当前导出不代表完整往返已实现。后续 Rust 或远端后端复用协议契约并替换 transport/存储实现。

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
|搜索所有概念|`/`，支持名称、别名、说明和类型|
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
