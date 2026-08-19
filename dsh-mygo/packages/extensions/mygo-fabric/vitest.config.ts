/**
 * mygo-fabric 测试配置（P3 自包含 workspace 形态）：@r05en1cu/* 内部包
 * 经显式 alias 解析到仓库内源码；@deepseek-ai/* 官方包经 node_modules
 * （公开 registry）解析。
 */
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@r05en1cu/dsh-mygo': here('../../cordis/mygo/src/index.ts'),
      '@r05en1cu/dsh-mygo-api': here('../../core/mygo-api/src/index.ts'),
      '@r05en1cu/dsh-mygo-loader-profile': here('../../loaders/mygo-loader-profile/src/index.ts'),
    },
  },
  test: {
    root: here('.'),
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    pool: 'forks',
    env: {
      MYGO_USER_DIR: join(tmpdir(), 'mygo-vitest-user-dir'),
    },
  },
})
