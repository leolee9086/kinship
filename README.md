# Kinship

面向家谱和人物关系的键盘优先编辑器。采用以焦点为中心的关系视图，优先考虑水平文字的可读性、关系语义和连续的聚焦过渡。

> 这是开发中的原型，不是已完成或已通过十万节点渲染验收的产品。当前公开提交用于建立可回退的代码基线。

## 当前结构

- TypeScript / React：编辑、键盘命令与应用状态。
- PixiJS：关系图、节点与连线的聚焦过渡、视口和小地图。
- 文字测量与布局、连接口路由、场景动画分层实现。
- `DataAdapter` 隔离 UI 与存储；当前经内部 fetch 路由读写 IndexedDB。
- Rust 后端属于后续计划，当前仓库不包含 Rust 服务。

已有视图选项包括展开层数、曲线/直线、关系文字开关，以及左侧跳跃节点的基准间距。连线颜色独立于布局区域；非直接关系按到焦点的最短连接跳数逐级淡化。

## 开发

使用 pnpm。当前路由依赖以相邻目录的本地包形式引用，因此需要先准备 [sac-path-router](https://github.com/leolee9086/sac-path-router)：

```sh
# 在同一父目录下操作
 git clone https://github.com/leolee9086/sac-path-router.git
 git clone https://github.com/leolee9086/kinship.git

 cd sac-path-router
 pnpm install
 pnpm build

 cd ../kinship
 pnpm install --frozen-lockfile
 pnpm dev
```

默认开发地址为 `http://localhost:5273/`。

```sh
pnpm build     # TypeScript 检查与生产构建
pnpm preview  # 预览生产构建
```

浏览器数据保存在当前站点的 IndexedDB 中。源码仓库不包含浏览器中的个人家谱、数据库导出或本地备份。空数据库首次启动会导入随项目提供的示例数据；已有数据库不会被示例种子覆盖。

## 交互

- 拖拽平移，滚轮缩放；触屏使用单指平移、双指缩放。
- 方向键切换亲属焦点，`Enter` 编辑姓名。
- `Insert` / `A` 添加子女，`P` 添加父母，`S` 添加配偶。
- `Delete` / `Backspace` 删除当前人物，`?` 打开帮助。

上述交互仍在完善，键盘的兄弟姐妹导航、触屏边界情况和缩放 LOD 需要进一步验收。构建通过不代表这些交互均已完成验收。

## 接下来讨论的模型

以下是待讨论的设计方向，**尚未实现**：

- 关系类型树与两端角色分离，明确父、母、子、女及未知角色。
- 一条关系事实支持对偶的双向阅读，例如 `父→女 ↔ 女→父`。
- 按关系类型或两端角色选择赋色轴，通过层级深度决定颜色区分粒度。
- 关系语义、布局区域、跳数淡显独立配置。

## 许可证

Kinship 原创代码采用 **GNU Affero General Public License v3.0 or later**，SPDX 标识为 **`AGPL-3.0-or-later`**，不是仅限第三版。

完整协议见 [LICENSE](./LICENSE)，适用声明见 [NOTICE](./NOTICE)。第三方依赖与示例数据保留各自的许可证和来源，见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
