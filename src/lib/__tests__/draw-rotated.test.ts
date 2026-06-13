/**
 * draw-rotated 测试 —— 用 mock CanvasRenderingContext2D 记录变换调用，
 * 验证 0/90/180/270 度 × 手动旋转/autoRotated 的 8 种组合各自产生正确的
 * translate/rotate/drawImage 序列与目标宽高（旋转 90/270 时宽高须互换）。
 *
 * 不依赖真实 Canvas 2D（happy-dom 不实现），纯逻辑验证。
 */
import { describe, it, expect } from 'vitest';
import { drawRotatedImage } from '../draw-rotated';

// drawRotatedImage 只调用 ctx.drawImage(img, ...)，img 本身不被读取，用空对象 cast 即可
const MOCK_IMG = {} as unknown as CanvasImageSource;

interface MockCall { op: string; args: number[]; }

function createMockCtx() {
  const calls: MockCall[] = [];
  const ctx = {
    save: () => calls.push({ op: 'save', args: [] }),
    translate: (x: number, y: number) => calls.push({ op: 'translate', args: [x, y] }),
    rotate: (r: number) => calls.push({ op: 'rotate', args: [r] }),
    // 第一个参数是 image，记录其余数值参数
    drawImage: (_img: unknown, ...rest: number[]) => calls.push({ op: 'drawImage', args: rest }),
    restore: () => calls.push({ op: 'restore', args: [] }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

// 固定调用参数
const X = 10, Y = 20, DW = 100, DH = 50;
const SRC = [1, 2, 30, 40] as const;

/** 断言 calls 序列匹配某个目标旋转的变换 */
function expectTransform(calls: MockCall[], expectedCase: 0 | 90 | 180 | 270): void {
  // 始终 save ... restore 包裹
  expect(calls[0]?.op).toBe('save');
  expect(calls[calls.length - 1]?.op).toBe('restore');

  if (expectedCase === 0) {
    // case 0: 直接 drawImage（无 translate/rotate）
    expect(calls.length).toBe(3);
    expect(calls[1].op).toBe('drawImage');
    expect(calls[1].args).toEqual([...SRC, X, Y, DW, DH]);
    return;
  }

  // 旋转分支: save, translate, rotate, drawImage, restore
  expect(calls.length).toBe(5);
  expect(calls[1].op).toBe('translate');
  expect(calls[2].op).toBe('rotate');
  expect(calls[3].op).toBe('drawImage');

  if (expectedCase === 90) {
    expect(calls[1].args).toEqual([X + DW, Y]);
    expect(calls[2].args).toEqual([Math.PI / 2]);
    expect(calls[3].args).toEqual([...SRC, 0, 0, DH, DW]); // 目标宽高互换
  } else if (expectedCase === 180) {
    expect(calls[1].args).toEqual([X + DW, Y + DH]);
    expect(calls[2].args).toEqual([Math.PI]);
    expect(calls[3].args).toEqual([...SRC, 0, 0, DW, DH]); // 宽高不变
  } else {
    // 270
    expect(calls[1].args).toEqual([X, Y + DH]);
    expect(calls[2].args).toEqual([-Math.PI / 2]);
    expect(calls[3].args).toEqual([...SRC, 0, 0, DH, DW]); // 目标宽高互换
  }
}

// rotation × autoRotated → 最终旋转角度（drawRotatedImage 内部 (rotation + autoRotated?90:0)%360）
const MATRIX: Array<{ rot: 0 | 90 | 180 | 270; auto: boolean; expectCase: 0 | 90 | 180 | 270 }> = [
  { rot: 0,   auto: false, expectCase: 0 },
  { rot: 0,   auto: true,  expectCase: 90 },
  { rot: 90,  auto: false, expectCase: 90 },
  { rot: 90,  auto: true,  expectCase: 180 },
  { rot: 180, auto: false, expectCase: 180 },
  { rot: 180, auto: true,  expectCase: 270 },
  { rot: 270, auto: false, expectCase: 270 },
  { rot: 270, auto: true,  expectCase: 0 },
];

describe('drawRotatedImage — 旋转组合矩阵', () => {
  for (const { rot, auto, expectCase } of MATRIX) {
    const label = `rotation=${rot}${auto ? ' +autoRotate' : ''} → 最终 ${expectCase}°`;
    it(label, () => {
      const { ctx, calls } = createMockCtx();
      drawRotatedImage(ctx, MOCK_IMG, X, Y, DW, DH, SRC[0], SRC[1], SRC[2], SRC[3], rot, auto);
      expectTransform(calls, expectCase);
    });
  }

  it('始终以 save/restore 包裹（不污染调用方 ctx 状态）', () => {
    const { ctx, calls } = createMockCtx();
    drawRotatedImage(ctx, MOCK_IMG, X, Y, DW, DH, 1, 2, 30, 40, 90, false);
    expect(calls[0].op).toBe('save');
    expect(calls[calls.length - 1].op).toBe('restore');
  });

  it('90° 与 270° 的目标宽高互换（drawHeight↔drawWidth）', () => {
    const r90 = createMockCtx();
    drawRotatedImage(r90.ctx, MOCK_IMG, X, Y, DW, DH, 1, 2, 30, 40, 90, false);
    const r90Draw = r90.calls.find(c => c.op === 'drawImage')!;
    // dest w,h 在 args 末两位，互换后应为 [DH, DW]
    expect(r90Draw.args.slice(-2)).toEqual([DH, DW]);

    const r270 = createMockCtx();
    drawRotatedImage(r270.ctx, MOCK_IMG, X, Y, DW, DH, 1, 2, 30, 40, 270, false);
    const r270Draw = r270.calls.find(c => c.op === 'drawImage')!;
    expect(r270Draw.args.slice(-2)).toEqual([DH, DW]);
  });
});
