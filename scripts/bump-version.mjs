#!/usr/bin/env node
/**
 * [bump] 统一更新版本号 —— 杜绝多文件漏改。
 *
 * 同步改写以下版本号：
 *   1. package.json                 顶层 "version"
 *   2. src-tauri/tauri.conf.json    顶层 "version"
 *   3. src-tauri/Cargo.toml         [package] 段 version = "..."
 *   4. src-tauri/Cargo.lock         本项目包条目 version（自动跟随 Cargo.toml）
 *
 * 用法：
 *   npm run bump -- 1.2.1
 *   node scripts/bump-version.mjs 1.2.1
 *
 * 规范：每次发版禁止手改单文件版本号，一律走本脚本。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 版本号定位规则 —— 每条为 [相对路径, 匹配正则]。
 * 正则捕获三组：前缀 / 旧版本号 / 后缀，便于原地替换且保留原格式。
 * - JSON 两处只匹配顶层 "version"（依赖项 version 在嵌套结构里，格式不同，不会误伤）。
 * - Cargo.toml 用 ^ + m flag 只匹配 [package] 段行首的 version，不碰 [dependencies]。
 * - Cargo.lock 精确匹配 name = "png-layout-tool" 紧跟的 version 行，不碰依赖包。
 */
const TARGETS = [
  ['package.json', /("version"\s*:\s*")(\d+\.\d+\.\d+(?:[-+][\w.]+)?)(")/],
  ['src-tauri/tauri.conf.json', /("version"\s*:\s*")(\d+\.\d+\.\d+(?:[-+][\w.]+)?)(")/],
  ['src-tauri/Cargo.toml', /^(version\s*=\s*")(\d+\.\d+\.\d+(?:[-+][\w.]+)?)(")/m],
  ['src-tauri/Cargo.lock', /(name = "png-layout-tool"\nversion = ")(\d+\.\d+\.\d+(?:[-+][\w.]+)?)(")/],
];

/** SemVer 校验：x.y.z，可选 -prerelease / +build */
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

const target = process.argv[2];

if (!target) {
  console.error('[bump] 缺少版本号参数。用法：npm run bump -- 1.2.1');
  process.exit(1);
}
if (!SEMVER.test(target)) {
  console.error(`[bump] 版本号格式非法："${target}"，应为 x.y.z（SemVer）`);
  process.exit(1);
}

console.log(`\n[bump] 统一版本号 → ${target}\n`);

let changed = 0;
for (const [rel, pattern] of TARGETS) {
  const abs = resolve(ROOT, rel);
  const content = readFileSync(abs, 'utf8');
  const match = pattern.exec(content);
  if (!match) {
    console.error(`[bump] ${rel}：未匹配到 version 字段，请检查文件结构`);
    process.exit(1);
  }
  const before = match[2];
  if (before === target) {
    console.log(`  · ${rel.padEnd(26)} ${before}  (已是目标，跳过)`);
    continue;
  }
  // 函数式替换，避免 $N 反向引用与版本号数字混淆
  const next = content.replace(pattern, (_m, prefix, _old, suffix) => `${prefix}${target}${suffix}`);
  writeFileSync(abs, next, 'utf8');
  console.log(`  ✓ ${rel.padEnd(26)} ${before}  →  ${target}`);
  changed += 1;
}

console.log(`\n[bump] 完成：${changed} 个文件已更新。`);
console.log(`[bump] 下一步：检查 diff 后提交，例如：`);
console.log(`        git commit -am "chore(tauri): bump version to ${target}"\n`);
