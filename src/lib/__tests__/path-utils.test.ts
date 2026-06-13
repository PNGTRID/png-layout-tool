import { describe, it, expect } from 'vitest';
import { splitFilePath, buildSegmentPath, buildSegmentPaths, type ParsedFilePath } from '../path-utils';

describe('splitFilePath', () => {
  const cases: Array<[string, ParsedFilePath]> = [
    ['D:\\out\\banner.png', { dir: 'D:\\out', base: 'banner', ext: 'png', sep: '\\' }],
    ['/Users/x/banner.png', { dir: '/Users/x', base: 'banner', ext: 'png', sep: '/' }],
    ['/Users/x/layout', { dir: '/Users/x', base: 'layout', ext: '', sep: '/' }],
    ['/x/banner.2x.png', { dir: '/x', base: 'banner.2x', ext: 'png', sep: '/' }],
    ['C:\\file', { dir: 'C:', base: 'file', ext: '', sep: '\\' }],
    ['banner.png', { dir: '', base: 'banner', ext: 'png', sep: '/' }],
    ['.bashrc', { dir: '', base: '.bashrc', ext: '', sep: '/' }],
    ['/OUT/BANNER.PNG', { dir: '/OUT', base: 'BANNER', ext: 'png', sep: '/' }],
  ];
  it.each(cases)('parses %s', (input, expected) => {
    expect(splitFilePath(input)).toEqual(expected);
  });
});

describe('buildSegmentPath', () => {
  it('segCount=1 还原原路径', () => {
    const parsed = splitFilePath('/out/banner.png');
    expect(buildSegmentPath(parsed, 0, 1)).toBe('/out/banner.png');
  });

  it('segCount>1 加 _partN 后缀（1-based）', () => {
    const parsed = splitFilePath('/out/banner.png');
    expect(buildSegmentPath(parsed, 0, 3)).toBe('/out/banner_part1.png');
    expect(buildSegmentPath(parsed, 2, 3)).toBe('/out/banner_part3.png');
  });

  it('保留原分隔符风格（Windows \\）', () => {
    const parsed = splitFilePath('D:\\out\\banner.png');
    expect(buildSegmentPath(parsed, 1, 2)).toBe('D:\\out\\banner_part2.png');
  });

  it('无扩展名时正确拼接', () => {
    const parsed = splitFilePath('/out/layout');
    expect(buildSegmentPath(parsed, 0, 2)).toBe('/out/layout_part1');
  });
});

describe('buildSegmentPaths', () => {
  it('segCount=1 返回原路径单元素数组', () => {
    expect(buildSegmentPaths('/out/banner.png', 1)).toEqual(['/out/banner.png']);
  });

  it('segCount=N 返回 N 个段路径', () => {
    expect(buildSegmentPaths('/out/banner.png', 3)).toEqual([
      '/out/banner_part1.png',
      '/out/banner_part2.png',
      '/out/banner_part3.png',
    ]);
  });

  it('Windows 路径段路径保持 \\ 分隔符', () => {
    expect(buildSegmentPaths('D:\\out\\banner.png', 2)).toEqual([
      'D:\\out\\banner_part1.png',
      'D:\\out\\banner_part2.png',
    ]);
  });
});
