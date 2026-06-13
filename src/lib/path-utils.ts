/**
 * 文件路径解析工具（纯字符串操作，不依赖 Node path 模块）。
 * 处理 Tauri 跨平台路径（/ 与 \ 混用），用于分块导出时构造多文件名。
 */

export interface ParsedFilePath {
  /** 目录部分，末尾无分隔符（无目录时为空串） */
  dir: string;
  /** 不含扩展名的文件名 */
  base: string;
  /** 扩展名，不含点，小写；无扩展名时为空串 */
  ext: string;
  /** 原路径使用的分隔符（'/' 或 '\'），还原时保持风格一致 */
  sep: '/' | '\\';
}

/** 分块文件名后缀（如 banner_part1.png） */
const SEGMENT_SUFFIX = 'part';

/**
 * 解析文件路径为 {dir, base, ext}。同时识别 / 与 \ 分隔符（Tauri 跨平台），
 * 多点文件名取最后一个点为扩展名分隔；以点开头的隐藏文件视为无扩展名。
 *
 * @example
 *   splitFilePath('D:\\out\\banner.png') → {dir:'D:\\out', base:'banner', ext:'png', sep:'\\'}
 *   splitFilePath('/Users/x/layout')     → {dir:'/Users/x', base:'layout', ext:'', sep:'/'}
 */
export function splitFilePath(filePath: string): ParsedFilePath {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const sep: '/' | '\\' = lastSep >= 0 && filePath[lastSep] === '\\' ? '\\' : '/';
  const dir = lastSep >= 0 ? filePath.slice(0, lastSep) : '';
  const fileName = lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
  const lastDot = fileName.lastIndexOf('.');
  // lastDot <= 0：无点，或以点开头（隐藏文件）——视为无扩展名
  if (lastDot <= 0) {
    return { dir, base: fileName, ext: '', sep };
  }
  return {
    dir,
    base: fileName.slice(0, lastDot),
    ext: fileName.slice(lastDot + 1).toLowerCase(),
    sep,
  };
}

/** 拼接 dir + sep + 文件名（含扩展名） */
function joinName(parsed: ParsedFilePath, name: string): string {
  const fullName = parsed.ext ? `${name}.${parsed.ext}` : name;
  return parsed.dir ? `${parsed.dir}${parsed.sep}${fullName}` : fullName;
}

/**
 * 根据解析后的路径、段索引、总段数构造分块文件完整路径。
 * 段数 ≤ 1 时还原为原路径（零行为变化）。
 *
 * @example
 *   buildSegmentPath(parsed, 0, 1) → 'D:/out/banner.png'
 *   buildSegmentPath(parsed, 1, 3) → 'D:/out/banner_part2.png'
 */
export function buildSegmentPath(parsed: ParsedFilePath, segIndex: number, segCount: number): string {
  const name = segCount <= 1 ? parsed.base : `${parsed.base}_${SEGMENT_SUFFIX}${segIndex + 1}`;
  return joinName(parsed, name);
}

/**
 * 便捷封装：基础路径 + 总段数 → 所有段路径数组。
 * 段数 ≤ 1 时返回单元素数组（原路径）。
 */
export function buildSegmentPaths(basePath: string, segCount: number): string[] {
  if (segCount <= 1) return [basePath];
  const parsed = splitFilePath(basePath);
  return Array.from({ length: segCount }, (_, i) => buildSegmentPath(parsed, i, segCount));
}
