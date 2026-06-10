# src/hooks/ — React Hooks

本目录包含所有自定义 React Hooks。每个 Hook 以 `use` 前缀命名，文件名对应 Hook 名（如 `useImages.ts`）。

## Hook 职责与状态

| Hook | 管理的状态 | 返回值 | 核心依赖 |
|------|-----------|--------|----------|
| useImages | `UploadedImage[]`（上传/删除/数量/旋转） | images, addImages, removeImage, updateQuantity, etc. | image-loader, image-cache |
| useLayout | `LayoutResult` + `LayoutWarning[]` + position overrides | params, layout, warnings, updateParam, relayout, updatePosition | layout-engine |
| useDragDrop | 拖拽事件监听 | onDragOver / onDrop handlers | 无 |
| useCanvasInteraction | 选中/拖拽移动状态 | selectedCellId, dragState, handlers | 无 |
| useCanvasRenderer | 画布渲染（预览/标尺/标注） | render 函数 | canvas-utils, gap-ruler, draw-rotated |
| useCanvasZoom | 缩放状态 | zoom level / handlers | 无（ZOOM_MIN=0.1, ZOOM_MAX=2.0, ZOOM_STEP=0.1） |
| useAppUpdater | 自动更新状态 | updateInfo, checkForUpdate | @tauri-apps/plugin-updater |

## useLayout 缓存机制

- 使用 `useMemo` 缓存排版结果，依赖：`[images, debouncedParams, layoutVersion]`
- 数值参数（gap/dpi/canvasWidthCm/canvasHeightCm）有 **200ms 防抖**
- 布尔/枚举/颜色参数**立即生效**
- `layoutVersion` 计数器由 `relayout()` 递增，强制重算
- 手动位置覆盖（`positionOverrides`）作为第二层 `useMemo` 应用在计算结果之上

## useImages 核心流程

- 上传：`loadImageInfo(file)` → processLoadedImage → 加入 images 列表
- 删除：从列表移除 + `evictImage(objectUrl)` 清缓存 + `URL.revokeObjectURL()`
- 清空：`clearImageCache()` + `clearAll()` + 批量释放 ObjectURL
- PSD 导入：`psd-loader.ts` 拆分图层 → 每层生成一个 UploadedImage

## 编写规范

- Hook 必须在组件顶层调用，禁止条件/循环中使用
- `useEffect` 依赖数组必须完整；每个 effect 只做一件事
- 清理函数必须处理：事件监听移除 / 定时器清除 / ObjectURL 释放
- `useCallback` / `useMemo` 仅在实测性能瓶颈时使用
- 不要直接调用 Tauri API（通过 `getPlatformAPI()` 抽象层）
