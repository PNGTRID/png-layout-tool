# PNG 透明图片自动排版工具

将透明 PNG 图片自动排列成紧凑布局的桌面工具，支持 PSD 图层导入和 CMYK PSD 导出。

## 功能特性

- **批量导入**：拖拽文件/文件夹上传，支持 PNG / PSD（自动拆分图层）/ TIF
- **智能排版**：MaxRects BSSF 算法 × 6 种排序策略 × 多候选宽度择优，支持自动旋转
- **实时预览**：Canvas 渲染，选中/拖拽/缩放/距离标注
- **参数可调**：间距、DPI、画布尺寸、背景色、裁切线、出血
- **图片管理**：删除、排序、数量复制、旋转、自定义输出尺寸、文件名数量自动识别
- **多格式导出**：PNG / PSD（CMYK + PackBits RLE）/ TIF；超大画布支持流式（单文件，内存恒定）与分段（多文件）两种大画布导出
- **自动更新**：启动自动检查，支持手动检查

## 技术栈

Tauri v2 · React 18 · TypeScript 5 · Tailwind CSS · Vite 5

## 开发

```bash
# 安装依赖
npm install

# 开发模式（前端热更新）
npm run dev

# Tauri 开发模式（Rust + 前端）
npm run tauri dev

# 运行测试
npm run test

# ESLint 检查
npm run lint

# 构建
npm run tauri build
```

## 构建

需要 Rust 工具链（[rustup](https://rustup.rs/)）和 Node.js 18+。

```bash
npm install
npm run tauri build
```

构建产物在 `src-tauri/target/release/bundle/` 下。

## 项目结构

```
src/
├── components/       # UI 组件（10 个）
├── hooks/            # React Hooks（9 个）
├── lib/              # 核心业务逻辑（排版引擎/多格式导出/PSD·TIF 处理）
└── shared/           # 类型定义/常量/平台抽象 API/应用设置
src-tauri/            # Rust 后端（仅平台桥接）
```

## License

Private — All rights reserved.
