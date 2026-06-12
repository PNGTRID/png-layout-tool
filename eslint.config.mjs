/**
 * ESLint flat config (ESLint v9)。
 *
 * 组合：JS 推荐规则 + TypeScript 推荐规则 + React Hooks 规则。
 * 风格统一交给编辑器/Prettier；此配置只盯「逻辑错误 / 陷阱 / 死代码」，
 * 与 tsc 形成互补（tsc 管类型，ESLint 管 hooks 依赖、未用变量、可疑模式等）。
 *
 * 运行：npm run lint
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // ─── 全局忽略：构建产物 / Rust 后端 / 脚本，不参与 lint ───────────────
  {
    ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'scripts/**'],
  },

  // ─── JS + TypeScript 推荐规则基线 ───────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── 项目源码：React + 浏览器环境 + Hooks 规则 ──────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Hooks 规则：rules-of-hooks 是硬错误；exhaustive-deps 先警告（依赖缺失是常见隐蔽 bug）
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // 未使用变量：下划线前缀（_arg）允许保留 —— 约定俗成的占位/有意未用
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
