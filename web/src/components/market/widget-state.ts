/**
 * Widget 四态机：loading → success ↔ stale → error。
 * 见 spec 第 6 节"四态显示规则"。
 *
 * 规则：
 *  - 任何成功 → kind: 'success', errorCount: 0
 *  - 错误累计 ≥ 3：从 loading 转 error；从 success/stale 转 stale（保留旧 data）
 *  - 错误累计 < 3：保留当前 kind 但更新 errorCount
 */

const STALE_THRESHOLD = 3;

export type WidgetState<T> =
  | { kind: 'loading'; errorCount: number }
  | { kind: 'success'; data: T; errorCount: number }
  | { kind: 'stale'; data: T; errorCount: number }
  | { kind: 'error'; errorCount: number };

export type WidgetAction<T> =
  | { type: 'success'; data: T }
  | { type: 'error' };

export function initialWidgetState<T>(): WidgetState<T> {
  return { kind: 'loading', errorCount: 0 };
}

export function reduceWidgetState<T>(
  state: WidgetState<T>,
  action: WidgetAction<T>,
): WidgetState<T> {
  if (action.type === 'success') {
    return { kind: 'success', data: action.data, errorCount: 0 };
  }
  const nextErrors = state.errorCount + 1;
  if (state.kind === 'loading') {
    return nextErrors >= STALE_THRESHOLD
      ? { kind: 'error', errorCount: nextErrors }
      : { kind: 'loading', errorCount: nextErrors };
  }
  if (state.kind === 'error') {
    return { kind: 'error', errorCount: nextErrors };
  }
  // success or stale
  if (nextErrors >= STALE_THRESHOLD) {
    return { kind: 'stale', data: state.data, errorCount: nextErrors };
  }
  return { kind: state.kind, data: state.data, errorCount: nextErrors };
}
