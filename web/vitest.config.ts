import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-logic tests only (color-mapping, widget-state).
    // 当加入需要 DOM 的 React 组件测试时，切换到 'jsdom' 并安装 jsdom + testing-library。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
