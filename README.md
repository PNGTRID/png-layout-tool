# PNG 透明图片自动排版工具

将透明 PNG 图片自动排列成紧凑布局的桌面工具，支持 PSD 图层导入和 CMYK PSD 导出。

## 功能特性

- **批量导入**：拖拽文件/文件夹上传，支持 PNG 和 PSD（自动拆分图层）
- **智能排版**：MaxRects BSSF 算法 × 6 种排序策略择优，支持自动旋转
- **实时预览**：Canvas 渲染，选中/拖拽/缩放/距离标注
- **参数可调**：间距、DPI、画布尺寸、对齐方式、背景色
- **图片管理**：删除、排序、数量复制、旋转、自定义输出尺寸
- **双格式导出**：PNG 和 PSD（CMYK 色彩空间，PackBits RLE 压缩）
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
├── components/       # UI 组件（8 个）
├── hooks/            # React Hooks（7 个）
├── lib/              # 核心业务逻辑（排版引擎/导出/PSD 处理）
└── shared/           # 类型定义/常量/平台抽象 API
src-tauri/            # Rust 后端（仅平台桥接）
```

## License

Private — All rights reserved.
