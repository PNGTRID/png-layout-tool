import { describe, it, expect } from 'vitest';
import {
  EMPTY_POSITION_HISTORY,
  beginPositionEdit,
  undoPosition,
  redoPosition,
  type PositionMap,
} from '../position-history';

describe('position-history', () => {
  // ─── 核心不变量：撤销必须恢复到「编辑前」状态（P0 回归守护） ─────────
  it('undo restores the PRE-edit snapshot captured at beginPositionEdit', () => {
    const beforeDrag: PositionMap = { 'cell-0': { x: 0, y: 0 } };
    const afterDrag: PositionMap = { 'cell-0': { x: 100, y: 50 } };

    // 拖动开始：压入编辑前快照
    let history = beginPositionEdit(EMPTY_POSITION_HISTORY, beforeDrag);
    // 拖动结束：current 已变为 afterDrag（由 updatePosition 实时写入）
    history = beginPositionEdit(history, beforeDrag); // 仅用于构造，下方用 afterDrag 撤销

    const { history: h2, restored } = undoPosition(history, afterDrag);

    // 撤销应恢复到「编辑前」，而非编辑后
    expect(restored).toEqual(beforeDrag);
    expect(h2.future).toEqual([afterDrag]);
  });

  it('undo returns null when there is no past history', () => {
    const { history, restored } = undoPosition(EMPTY_POSITION_HISTORY, {});
    expect(restored).toBeNull();
    expect(history).toEqual(EMPTY_POSITION_HISTORY);
  });

  it('redo returns null when there is no future history', () => {
    const { history, restored } = redoPosition(EMPTY_POSITION_HISTORY, {});
    expect(restored).toBeNull();
    expect(history).toEqual(EMPTY_POSITION_HISTORY);
  });

  // ─── 完整 begin → undo → redo 往返 ───────────────────────────────────
  it('full undo/redo round-trip restores states in order', () => {
    const s0: PositionMap = {};
    const s1: PositionMap = { 'cell-0': { x: 10, y: 10 } };
    const s2: PositionMap = { 'cell-0': { x: 20, y: 20 } };

    // 两次独立编辑：begin 捕获各自编辑前的状态
    let history = beginPositionEdit(EMPTY_POSITION_HISTORY, s0); // 编辑1前 = s0
    history = beginPositionEdit(history, s1);                     // 编辑2前 = s1

    // 撤销编辑2 → 应回到 s1
    let r = undoPosition(history, s2);
    expect(r.restored).toEqual(s1);
    history = r.history;

    // 再撤销编辑1 → 应回到 s0
    r = undoPosition(history, s1);
    expect(r.restored).toEqual(s0);
    history = r.history;

    // 无更多历史
    r = undoPosition(history, s0);
    expect(r.restored).toBeNull();

    // 重做编辑1 → s1
    r = redoPosition(history, s0);
    expect(r.restored).toEqual(s1);
    history = r.history;

    // 重做编辑2 → s2
    r = redoPosition(history, s1);
    expect(r.restored).toEqual(s2);
  });

  // ─── 新编辑清空 future（重做链失效） ─────────────────────────────────
  it('beginPositionEdit after undo clears the redo chain', () => {
    const s0: PositionMap = { 'cell-0': { x: 0, y: 0 } };
    const s1: PositionMap = { 'cell-0': { x: 5, y: 5 } };
    const s2: PositionMap = { 'cell-0': { x: 9, y: 9 } };

    let history = beginPositionEdit(EMPTY_POSITION_HISTORY, s0);
    const undone = undoPosition(history, s1);
    expect(undone.history.future).toHaveLength(1);

    // 撤销后发起新编辑 → future 必须清空
    history = beginPositionEdit(undone.history, s2);
    expect(history.future).toHaveLength(0);
    expect(history.past).toHaveLength(1);
  });

  // ─── 不可变性：原 history 不被修改 ───────────────────────────────────
  it('does not mutate the input history', () => {
    const original: PositionMap = { 'cell-0': { x: 1, y: 1 } };
    const history = { past: [original], future: [] };
    const snapshot = { past: [...history.past], future: [...history.future] };

    undoPosition(history, { 'cell-0': { x: 2, y: 2 } });
    redoPosition(history, { 'cell-0': { x: 2, y: 2 } });

    expect(history.past).toEqual(snapshot.past);
    expect(history.future).toEqual(snapshot.future);
  });
});
