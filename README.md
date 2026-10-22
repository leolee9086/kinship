# Kinship

一个以焦点为中心、键盘优先的通用概念关系编辑器。家谱是其中一个阅读视角；人物、地点、事件、组织、文献、类型、角色和具体关系都使用 UUID 概念身份。

## 当前能力

- 关系拥有带 UUID 的参与槽，每个槽引用角色概念和参与概念；支持多人关系、关系参与另一关系，同一对概念可有多条独立关系。
- 二元关系可以选中为线、展开成节点或直接聚焦；多人关系保留枢纽，展开和压缩不创建新事实。
- **视角决定看什么**：族谱、协作、事件、全部关系。分类可设为主轴、淡显、收进“相关”或隐藏，子分类继承最近规则。主轴先参与遍历和布局，淡显只补充背景，“相关”可临时展开。
- **视图决定怎样画**：上下左右方向规则、四个方向独立的文字框边缘间距、颜色轴与区分深度、调色板、曲线和背景。
- 方向规则相对当前焦点读取。连线根据两端实际位置选择端口；配偶等对称关系不依赖参与槽录入顺序。角色显示在线上靠近所属参与者的位置。
- 淡显概念和关系仍可用鼠标、触屏直接点击，方向键导航只选择主轴概念。聚焦淡显或非主轴概念时，焦点始终可见。
- 图片和简单视频背景通过上传资源接口保存；支持重载、清除、强度、模糊和视频暂停。视频静音循环，在后台或系统要求减少动画时暂停。单文件最大 100 MiB。
- PixiJS 保留平滑聚焦、平移、缩放、视口裁剪和小地图；移动端使用概念库抽屉、单指平移与双指缩放。

当前仍是开发原型。Rust 服务、来源争议工作流、引用分身和完整图库服务端查询尚未实现。界面只显示预算内邻域；规模测试不等于同时渲染十万节点。

## 数据与边界

所有业务数据、持久设置和媒体操作只有一条路径：

```text
React UI → DataAdapter → internal fetch → resource routes → GraphRepository → IndexedDB
```

UI 不直接访问数据库。之后接 Rust 服务时，可以替换请求分发或仓库后端，保留概念 UUID 与资源契约。项目设计和开发记录在思源维护：[编辑器、语义内链与原子 RPC 方案](siyuan://blocks/20261023012229-e9zn1zp)、[开发进度和验收记录](siyuan://blocks/20261023011959-53mrjex)。RPC 与块编辑器部分目前为讨论方案。

当前仓库为站点自己的 `kinship-concepts` IndexedDB v1，包含 concepts、state、media。首次创建时生成虚构演示概念和关系，UUID 随后持久保存。没有旧人物/家庭 CRUD、旧身份转换、兼容导入、双写或运行时回退；不会自动读取或删除旧 `kinship` 库与开发中间库。不同域名、端口或浏览器配置使用各自的站点存储。

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
