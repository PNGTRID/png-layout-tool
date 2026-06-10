# PNG 排版工具 — 开发详细上下文

本文件是根 CLAUDE.md 的详细补充，覆盖编码规范、架构细节和模块约定。

## 架构详解

### 平台抽象层（src/shared/ipc.ts）

`IPlatformAPI` 接口定义了所有平台交互能力（`showSaveDialog` 保存对话框 + `writeFile` 文件写入）。Tauri 环境通过 `TauriPlatformAPI` 动态 import 实现，非 Tauri 环境降级为 `NullPlatformAPI`（no-op）。**所有文件操作必须通过此接口**，禁止直接 import `@tauri-apps/*`。

```typescript
// ✅ 正确
const api = getPlatformAPI();
await api.writeFile(path, data);
// ❌ 错误
import { writeFile } from '@tauri-apps/plugin-fs';
```

### 排版引擎（src/lib/layout-engine.ts）

- 算法：MaxRects BSSF（Best Short Side Fit）矩形装箱
- 6 种排序策略并行计算：面积 / 最长边 / 宽度 / 高度 / 周长 / 宽高比
- 后处理 `compactCells`：sweep-line O(n·k) 垂直压缩
- 后处理 `alignRows`：行内垂直对齐（top/center/bottom），通过 `LayoutParams.alignMode` 控制
- 每次调用完整重算，不做增量；结果通过 `useLayout` 缓存
- 自动旋转（90° CW）可选，在 `LayoutParams.autoRotate` 控制

### 导出管线

- **PNG**（export-png.ts）：Canvas `toBlob` → pHYs DPI 注入（CRC32） → `platformAPI.writeFile`，支持进度回调和裁切线
- **PSD**（export-psd.ts → psd-writer.ts）：RGBA→CMYK（cmyk.ts）→ PackBits RLE（rle.ts）→ 大端序写入（binary-writer.ts）→ PSD 文件结构
- PSD 分辨率资源 #1005 使用用户设定的 DPI（16.16 定点格式）
- PSD 图层名：ASCII Pascal string + luni（Unicode UTF-16BE）双写，保留中文图层名
- 裁切线（crop-marks.ts）：四角标记线，偏移内容边缘 0.3cm，线长 0.5cm

### 自动更新（hooks/useAppUpdater.ts）

- Tauri updater 插件 + 公钥签名验证
- 启动 3 秒后自动检查，工具栏手动检查
- GitHub Releases 端点：`https://github.com/PNGTRID/png-layout-tool/releases/latest/download/latest.json`

## 模块职责

### src/components/

| 组件 | 职责 |
|------|------|
| LayoutCanvas | 排版预览画布（选中/拖拽/缩放/距离标注/裁切线/缩放控件） |
| Toolbar | 顶部工具栏（撤销/重做/导出/重排/更新） |
| ControlPanel | 参数面板（间距/DPI/画布/对齐/裁切线/出血） |
| ImageList | 图片列表（删除/排序/数量/尺寸，ImageCard 用 React.memo 优化） |
| UploadArea | 拖拽上传区域（aria-label 支持） |
| Toast | 全局通知（4s 自动消失，最多 5 条，aria-live） |
| UpdateDialog | 自动更新对话框（role="dialog", aria-modal） |
| ErrorBoundary | 错误边界 |

### src/hooks/

| Hook | 职责 |
|------|------|
| useImages | 图片管理（上传/删除/数量/旋转），集成 useUndoRedo 撤销历史 |
| useLayout | 排版计算与缓存，参数不变不重算 |
| useDragDrop | 全局拖拽处理 |
| useCanvasInteraction | 画布交互（选中/拖拽移动，3px 死区） |
| useCanvasRenderer | 画布渲染（预览/标尺/标注/裁切线） |
| useCanvasZoom | 画布缩放（0.1x - 2.0x，zoomIn/zoomOut/zoomReset） |
| useAppUpdater | 自动更新逻辑 |
| useUndoRedo | 通用撤销/重做（50 步历史栈，Ctrl+Z/Y 快捷键） |

### src/lib/

| 模块 | 职责 |
|------|------|
| layout-engine | 排版核心（MaxRects BSSF × 6 策略 + compactCells + alignRows） |
| export-png / export-psd | PNG（含 pHYs DPI）/ PSD 导出入口 |
| psd-writer | PSD 文件结构组装（DPI 资源 + luni Unicode 图层名） |
| psd-loader | PSD 图层解析（ag-psd，支持嵌套图层组） |
| cmyk | RGBA → CMYK(A) 颜色转换 |
| rle | PackBits RLE 压缩 |
| binary-writer | 大端序二进制写入器 |
| image-cache | 共享缓存（单例 + LRU 淘汰） |
| image-loader | 图片加载与透明边裁剪 |
| draw-rotated | 带旋转的 Canvas 绘制 |
| canvas-utils | 命中测试/单位转换/标尺绘制 |
| gap-ruler | 距离标注线计算与渲染 |
| crop-marks | 裁切线（四角标记线，偏移 0.3cm + 线长 0.5cm） |

## 编码规范

### TypeScript

- 严格模式 `strict: true`：禁止隐式 any / 隐式 this / strict null 不检查
- 命名：接口/类型 `PascalCase` | 函数/变量 `camelCase` | 常量 `UPPER_SNAKE_CASE`
- 文件名：组件 `PascalCase.tsx` | 工具/hook `kebab-case.ts`
- 类型：对象用 `interface`，联合/工具类型用 `type`；禁止 `Object` / `any` / `Function`
- 禁止 `enum`，用字符串字面量联合类型（如 `rotation: 0 | 90 | 180 | 270`）
- 导入：按需导入（禁止 `import * as`）| 第三方在前、项目在后 | 类型用 `import type`
- 空值：优先 `?.` 和 `??`，所有可能为 null/undefined 的值必须检查

### React

- 函数组件 + Hooks，禁止 class 组件
- Hook 顶层调用，禁止条件/循环中使用
- 自定义 Hook 以 `use` 前缀，放在 `src/hooks/`
- `useEffect` 依赖数组完整，缺失需注释说明
- `useCallback` / `useMemo` 仅在性能瓶颈时使用
- 状态提升到最近公共父组件，prop drilling ≤ 3 层
- 列表 key 用 `id`，禁止 `index`
- 每个 `useEffect` 只做一件事；清理函数处理事件监听/定时器/ObjectURL

### Tailwind CSS

- 只用工具类，禁止自定义 CSS（`index.css` 除外）
- 类名顺序：布局 → 尺寸 → 间距 → 排版 → 背景 → 边框 → 效果
- 颜色/间距通过 `tailwind.config.js` 主题定义，禁止硬编码

### Rust（src-tauri/）

- `cargo fmt` 格式化 | `cargo clippy` 零警告
- 错误处理：`Result<T, E>` + `?` 操作符
- 后端仅做平台桥接（dialog/fs/updater），不处理业务数据

## 错误处理

分层策略：lib 抛异常 → hooks try-catch 转换 → 组件 showToast 展示 → Rust Result 传播

- 用户可见错误必须用中文（参考 App.tsx `friendlyErrorMessage`）
- Toast 4s 消失 / 最多 5 条
- 日志：`console.info` 记关键操作 | `console.error` 加 `[module]` 前缀 | 调试用 `console.debug`

## 性能规范

- 预览 ≤100M 像素，导出不限（始终原始分辨率）
- 大操作（>1000 图片或 >10000 cells）必须 Web Worker 或分帧渲染
- ObjectURL 及时释放 | 图片缓存 LRU 淘汰（`image-cache.ts`）
- 清空操作必须同时 `clearImageCache()` + `clearAll()`

## 安全规范

- 文件上传：仅 PNG/PSD | ≤200MB | 图片 ≤16,384px（拒绝不降采样）
- CSP 已配置 | 文件写入仅限白名单目录 | 更新公钥签名验证
- 签名私钥仅通过 GitHub Secrets 注入，禁止硬编码
- 禁止代码中出现 API Key / Token / 密码

## 测试

- 核心模块必须有测试：layout-engine / binary-writer / cmyk / rle
- 路径：`src/**/__tests__/**/*.test.ts`
- Mock 平台：`setPlatformAPI()` 注入，不依赖 Tauri
- Arrange → Act → Assert 三段式
- 边界必覆盖：空输入 / 单张 / 最大数量 / 零间距 / 极端 DPI
- 全量 < 30s | 单文件 < 5s | 禁止 `it.skip` 进主分支

## 开发注意

- Rust 后端仅平台能力，所有业务逻辑在前端
- 窗口 `dragDropEnabled: false`，前端 JS 全局监听拖放
- CI 仅构建 Windows，macOS 本地构建
- 测试文件和组件测试用 `happy-dom` 环境
