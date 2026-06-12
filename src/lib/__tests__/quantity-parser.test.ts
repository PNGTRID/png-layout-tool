import { describe, it, expect } from 'vitest';
import { parseQuantityFromName } from '../quantity-parser';
import type { QuantityTemplate } from '../../shared/types';

/** Build a template with defaults, overridden by the given fields. */
function tpl(overrides: Partial<QuantityTemplate> = {}): QuantityTemplate {
  return { enabled: true, suffixes: '个,张,份,pcs,PSC', numberPosition: 'before', ...overrides };
}

describe('parseQuantityFromName', () => {
  describe('numberPosition: before (数字在前)', () => {
    it('解析中文量词: 宽七-22个.png → 22', () => {
      expect(parseQuantityFromName('宽七-22个.png', tpl())).toBe(22);
    });
    it('解析 pcs: logo_5pcs.png → 5', () => {
      expect(parseQuantityFromName('logo_5pcs.png', tpl())).toBe(5);
    });
    it('容许数字与量词间空格: 图案 10 张 → 10', () => {
      expect(parseQuantityFromName('图案 10 张', tpl())).toBe(10);
    });
    it('无扩展名也能解析: 宽七-22个 → 22', () => {
      expect(parseQuantityFromName('宽七-22个', tpl())).toBe(22);
    });
    it('多段文件名仅去除最后扩展名: a.b-3个.png → 3', () => {
      expect(parseQuantityFromName('a.b-3个.png', tpl())).toBe(3);
    });
  });

  describe('numberPosition: after (数字在后)', () => {
    it('解析 pcs22 → 22', () => {
      expect(parseQuantityFromName('logo_pcs22.png', tpl({ numberPosition: 'after' }))).toBe(22);
    });
    it('解析 个100 → 100', () => {
      expect(parseQuantityFromName('件个100', tpl({ numberPosition: 'after' }))).toBe(100);
    });
  });

  describe('不匹配场景 → null', () => {
    it('无量词: 无数量.png → null', () => {
      expect(parseQuantityFromName('无数量.png', tpl())).toBeNull();
    });
    it('量词为空 → null', () => {
      expect(parseQuantityFromName('宽七-22个.png', tpl({ suffixes: '' }))).toBeNull();
    });
    it('数字为 0 → null', () => {
      expect(parseQuantityFromName('x-0个.png', tpl())).toBeNull();
    });
    it('enabled=false → null', () => {
      expect(parseQuantityFromName('宽七-22个.png', tpl({ enabled: false }))).toBeNull();
    });
    it('量词未包含该词: 22个 vs 仅配置 pcs → null', () => {
      expect(parseQuantityFromName('x-22个.png', tpl({ suffixes: 'pcs' }))).toBeNull();
    });
  });

  describe('边界与多量词', () => {
    it('多个量词命中第一个出现: 3个5张.png → 3', () => {
      expect(parseQuantityFromName('3个5张.png', tpl())).toBe(3);
    });
    it('自定义量词集只匹配配置项', () => {
      expect(parseQuantityFromName('x-22pcs.png', tpl({ suffixes: 'pcs' }))).toBe(22);
    });
    it('超大数量被 clamp 到上限 999', () => {
      expect(parseQuantityFromName('x-99999个.png', tpl())).toBe(999);
    });
    it('量词含正则特殊字符时安全转义', () => {
      // 量词 "(个)" 含括号，应作为字面量匹配而非分组
      expect(parseQuantityFromName('x-5(个).png', tpl({ suffixes: '(个)' }))).toBe(5);
    });
  });
});
