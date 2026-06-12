/**
 * 位置覆盖（position overrides）的撤销/重做纯逻辑。
 *
 * 抽离为独立模块的原因：
 * 1. 撤销时序正确性（"压入编辑前快照" 而非 "编辑后"）是核心不变量，
 *    独立成纯函数后可用单测严格守护，避免回归到「拖动后撤销无效」的旧 bug。
 * 2. useLayout 内部用 ref 持有历史（拖动期间不触发重渲染），但状态转换
 *    规则集中在此处，职责单一、易推理。
 *
 * 模式与 useUndoRedo 一致：past 栈存放「每次操作前的快照」，
 * 这样撤销时弹出的正是操作前的状态。
 */

/** 单元格位置覆盖表：cellId → {x, y} */
export type PositionMap = Record<string, { x: number; y: number }>;

/** 位置历史的不可变快照：past（可撤销）/ future（可重做） */
export interface PositionHistory {
  past: PositionMap[];
  future: PositionMap[];
}

/** 空历史 —— relayout 等重置场景的初始态 */
export const EMPTY_POSITION_HISTORY: PositionHistory = { past: [], future: [] };

/**
 * 开始一次位置编辑（拖动首次越过死区时调用）。
 *
 * 将「编辑前」的当前覆盖表压入 past，并清空 future（新操作使重做链失效）。
 * 关键：必须在位置被 updatePosition 改动之前调用，past 才能存住编辑前状态。
 *
 * @param history 当前历史
 * @param current 编辑前的覆盖表（调用方负责传入未被本次拖动改动的快照）
 * @returns 新历史（past 追加 current，future 清空）
 */
export function beginPositionEdit(history: PositionHistory, current: PositionMap): PositionHistory {
  return {
    past: [...history.past, current],
    future: [],
  };
}

/**
 * 撤销上一次位置编辑。
 *
 * @param history 当前历史
 * @param current 当前覆盖表（压入 future，供重做）
 * @returns `{ history, restored }`：restored 为要恢复的覆盖表，无历史时为 null
 */
export function undoPosition(
  history: PositionHistory,
  current: PositionMap
): { history: PositionHistory; restored: PositionMap | null } {
  if (history.past.length === 0) return { history, restored: null };
  const previous = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
    restored: previous,
  };
}

/**
 * 重做上一次被撤销的位置编辑。
 *
 * @param history 当前历史
 * @param current 当前覆盖表（压入 past，供再次撤销）
 * @returns `{ history, restored }`：restored 为要恢复的覆盖表，无可重做时为 null
 */
export function redoPosition(
  history: PositionHistory,
  current: PositionMap
): { history: PositionHistory; restored: PositionMap | null } {
  if (history.future.length === 0) return { history, restored: null };
  const next = history.future[0];
  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(1),
    },
    restored: next,
  };
}
