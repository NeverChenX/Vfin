import { describe, expect, it } from 'vitest';
import { reduceWidgetState, initialWidgetState, type WidgetState } from './widget-state';

describe('widget-state machine', () => {
  it('starts in loading', () => {
    expect(initialWidgetState().kind).toBe('loading');
  });

  it('transitions loading → success on first successful payload', () => {
    const next = reduceWidgetState(initialWidgetState(), { type: 'success', data: { v: 1 } });
    expect(next.kind).toBe('success');
    expect((next as Extract<WidgetState<{v:number}>, {kind:'success'}>).data).toEqual({ v: 1 });
  });

  it('transitions loading → error if first 3 polls all fail', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('loading'); // 还没达到 3 次
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('error');
  });

  it('transitions success → stale after 3 consecutive errors', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 42 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('stale');
    expect((s as Extract<WidgetState<number>, {kind:'stale'}>).data).toBe(42);
  });

  it('stale → success on successful payload (recovery)', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 1 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('stale');
    s = reduceWidgetState(s, { type: 'success', data: 2 });
    expect(s.kind).toBe('success');
  });

  it('resets error counter on each success', () => {
    let s = initialWidgetState<number>();
    s = reduceWidgetState(s, { type: 'success', data: 1 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'success', data: 2 });
    s = reduceWidgetState(s, { type: 'error' });
    s = reduceWidgetState(s, { type: 'error' });
    expect(s.kind).toBe('success'); // 不应该 stale
  });
});
