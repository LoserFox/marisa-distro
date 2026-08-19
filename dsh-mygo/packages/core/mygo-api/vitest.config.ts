/**
 * 包级测试配置（P3 自包含 workspace 形态）：@r05en1cu/* 内部引用显式映射到
 * 仓库内源码（避免 lib 产物双实例）；@deepseek-ai/* 官方包经 node_modules
 * （公开 registry）解析。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@r05en1cu/dsh-mygo-api/invariant': here('./src/invariant.ts'),
      '@r05en1cu/dsh-mygo-api': here('./src/index.ts'),
    },
  },
  test: {
    root: here('.'),
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    pool: 'forks',
  },
})
