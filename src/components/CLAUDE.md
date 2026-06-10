# src/components/ — UI 组件

本目录包含所有 React UI 组件。使用函数组件 + Hooks，禁止 class 组件。

## 组件架构

```
App.tsx（三栏布局：左侧列表 | 中间画布 | 右侧面板）
├── UploadArea          # 拖拽/点击上传入口
├── Toolbar             # 顶部操作栏（PNG/PSD 导出、重排、检查更新）
├── LayoutCanvas        # 排版预览画布
│   ├── 渲染层          # useCanvasRenderer — 预览/标尺/标注
│   ├── 交互层          # useCanvasInteraction — 选中/拖拽移动
│   └── 缩放层          # useCanvasZoom — Ctrl+Scroll / 按钮缩放
├── ImageList           # 左侧图片列表（删除/排序/数量/尺寸）
├── ControlPanel        # 右侧参数面板（间距/DPI/画布/对齐/背景/旋转）
├── Toast + showToast   # 全局通知（4s 消失，最多 5 条）
├── UpdateDialog        # 自动更新弹窗（版本信息/下载进度）
└── ErrorBoundary       # 错误边界兜底
```

## App.tsx 错误映射

`friendlyErrorMessage` 将技术错误映射为中文用户提示：

| 错误关键词 | 用户提示 |
|-----------|---------|
| `2d context` | Canvas 2D 不可用 |
| `PNG blob` | PNG 生成失败 |
| `write` / `保存` | 文件保存失败 |
| `cancelled` / `取消` | 操作已取消 |
| 其他 | `${context}失败：${msg}` |

## 状态管理

- App 管理的核心状态：`isExporting` / `exportProgress` / `canvasRef`
- 图片/排版/拖拽/更新状态分别由 hooks 管理（useImages / useLayout / useDragDrop / useAppUpdater）
- 状态提升到最近公共父组件，prop drilling ≤ 3 层

## 样式规范

- 只使用 Tailwind CSS 工具类，禁止自定义 CSS（index.css 除外）
- 类名顺序：布局 → 尺寸 → 间距 → 排版 → 背景 → 边框 → 效果
- 颜色通过 tailwind.config.js 主题定义（`lt-bg` / `lt-text` / `accent-500`），禁止硬编码
- 固定窗口桌面端，不需要响应式断点，但窗口缩小需保证不错乱

## 交互规范

- 文件操作通过 `platformAPI` 抽象层
- 错误通过 `showToast('error', msg)` 展示，用户可见信息必须中文
- 列表 key 使用 `id`，禁止 `index`
- 新增组件文件名 `PascalCase.tsx`
