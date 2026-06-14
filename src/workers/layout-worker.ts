import type { LayoutParams } from '../shared/types';
import { calculateLayout, type LayoutInputImage, type LayoutResultWithWarnings } from '../lib/layout-engine';

/**
 * 主线程 → Worker：排版计算请求。
 * images 只携带 calculateLayout 实际读取的纯字段（LayoutInputImage），
 * 不传 dataUrl / objectUrl，避免跨线程克隆大 base64 与主线程专属 URL。
 */
export type LayoutWorkerRequest = {
  reqId: number;
  images: LayoutInputImage[];
  params: LayoutParams;
};

/**
 * Worker → 主线程：排版计算结果。
 * 回传 reqId，供 useLayout 丢弃拖动滑块期间产生的过期响应。
 */
export type LayoutWorkerResponse = {
  reqId: number;
  result: LayoutResultWithWarnings;
};

/**
 * 排版计算 Worker —— 将 MaxRects 装箱（6 排序策略 × N 候选宽度 + compactCells 压缩 +
 * verifyNoOverlap 兜底）移出主线程，消除大集合（>1000 图）拖动参数时的 UI 冻结。
 *
 * 仅作为 Worker 入口存在：主线程通过 `new Worker(new URL('./layout-worker.ts', import.meta.url))`
 * 拉起，并 `import type` 其协议类型，不引入本文件的运行时代码（onmessage 副作用仅在
 * Worker 线程执行）。用最小 scope 类型断言而非 `webworker` lib，避免与项目 DOM lib 全局冲突。
 */
type LayoutWorkerScope = {
  onmessage: ((this: LayoutWorkerScope, ev: MessageEvent<LayoutWorkerRequest>) => void) | null;
  postMessage: (message: LayoutWorkerResponse) => void;
};

const workerScope = self as unknown as LayoutWorkerScope;

workerScope.onmessage = (e: MessageEvent<LayoutWorkerRequest>) => {
  const { reqId, images, params } = e.data;
  const result = calculateLayout(images, params);
  workerScope.postMessage({ reqId, result });
};
