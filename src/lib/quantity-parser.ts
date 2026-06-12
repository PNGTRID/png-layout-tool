/**
 * Filename quantity parsing utilities.
 * Extracts a print quantity from a file or layer name using a user-configurable
 * template (quantifier suffix + number position), so naming conventions like
 * "宽七-22个.png" or "logo_5pcs" are auto-recognised at upload time.
 *
 * Pure functions — no React, no platform dependencies.
 */
import type { QuantityTemplate } from '../shared/types';
import { MAX_QUANTITY_PER_IMAGE } from '../shared/constants';

/** Escape a literal string for safe embedding inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a print quantity from a file/layer name using the given template.
 *
 * Strips the file extension, then finds the first number adjacent to one of the
 * configured suffixes. Returns null when disabled, no suffix configured, or no
 * match — callers fall back to the default quantity (1).
 *
 * Examples (template: suffixes="个,张,pcs", numberPosition="before"):
 *   "宽七-22个.png" → 22
 *   "图案 10 张"    → 10
 *   "logo_5pcs"     → 5
 *   "无数量"         → null
 */
export function parseQuantityFromName(name: string, template: QuantityTemplate): number | null {
  if (!template.enabled) return null;

  // Strip the last file extension (e.g. "宽七-22个.png" → "宽七-22个")
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;

  const suffixes = template.suffixes
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (suffixes.length === 0) return null;

  const alternation = suffixes.map(escapeRegex).join('|');
  // \s* tolerates optional whitespace between number and suffix ("10 张")
  const pattern = template.numberPosition === 'before'
    ? new RegExp(`(\\d+)\\s*(?:${alternation})`)
    : new RegExp(`(?:${alternation})\\s*(\\d+)`);

  const match = stem.match(pattern);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value) || value < 1) return null;

  return Math.min(value, MAX_QUANTITY_PER_IMAGE);
}
