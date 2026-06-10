# src/lib/ — 核心业务逻辑

本目录包含排版引擎、导出管线和图片处理的全部核心逻辑。所有模块为纯函数/工具类，不依赖 React。

## 模块依赖关系

```
layout-engine.ts ← (无内部依赖，定义 LayoutWarning / LayoutResultWithWarnings)
  ↓
image-loader.ts → image-cache.ts → (HTMLImageElement 缓存)
  ↓
draw-rotated.ts → canvas-utils.ts
  ↓
export-png.ts  ← layout-engine + draw-rotated + canvas-utils
export-psd.ts ← layout-engine + psd-writer + image-loader
  ↓
psd-writer.ts ← psd-loader + cmyk + rle + binary-writer
```

## 关键类型分布

| 类型 | 定义位置 | 导出位置 |
|------|---------|---------|
| `UploadedImage` / `LayoutParams` / `LayoutCell` / `LayoutResult` | `src/shared/types.ts` | 全局 |
| `LayoutWarning` / `LayoutResultWithWarnings` | `layout-engine.ts` | 本模块 |
| `IPlatformAPI` / `SaveDialogOptions` | `src/shared/ipc.ts` | 全局 |

## 排版引擎（layout-engine.ts）

- 算法：MaxRects BSSF（Best Short Side Fit），面积感知的 tiebreaker
- **6 种排序策略**：area / maxSide / width / height / perimeter / aspect
- `scoreFit`：70% 紧密度 + 30% 面积效率的加权评分
- `compactCells`：sweep-line O(n·k) 垂直压缩
- 自动旋转：当无手动旋转时，原始和旋转两个方向都评分取优
- 常量限制：`MAX_CANVAS_HEIGHT`（100,000px）/ `MAX_LAYOUT_ITEMS`（2,000）

## 图片加载（image-loader.ts）

- `loadImageInfo(file)` → `UploadedImage`：完整加载管线
- 透明边裁剪 `computeTrimBounds`：两阶段扫描
  - 大图（>4M 像素）：先粗略扫描（≤1024px 缩小图）→ 再精细 ROI 扫描
  - 小图：直接逐行扫描
- DPI 读取：`readPngDpi` 解析 PNG pHYs chunk，设置 `targetWidthCm` / `targetHeightCm`
- 缩略图：降采样至 `MAX_THUMB_SIZE`（200px）仅供 UI 显示，**原始分辨率始终保留**

## 图片缓存（image-cache.ts）

- LRU 实现：利用 `Map` 插入顺序，命中时 delete+re-insert 移至末尾
- 最大容量：`MAX_CACHE_SIZE = 200`
- API：`loadImage()` / `evictImage()` / `clearImageCache()` / `getCacheSize()`
- 删除图片时必须调用 `evictImage()`，清空时必须 `clearImageCache()` + `clearAll()`

## 导出管线

- **PNG**（export-png.ts）：Canvas `toBlob` → `platformAPI.writeFile`，支持进度回调
- **PSD**（export-psd.ts → psd-writer.ts）：RGBA→CMYK（cmyk.ts）→ PackBits RLE（rle.ts）→ 大端序写入（binary-writer.ts）→ PSD 文件结构
- PSD 图层名截断至 255 字节（格式规范）
- 导出始终使用原始分辨率，不受预览 100M 像素限制

## 编写约束

- 禁止在此目录中 import React 或任何 UI 组件
- 禁止直接调用 Tauri API，所有平台操作通过 `getPlatformAPI()`
- 新增常量放 `src/shared/constants.ts`，不在此处硬编码
- 新模块文件名 `kebab-case.ts`，使用命名导出，禁止 default export
- 公共函数必须包含 JSDoc 注释
