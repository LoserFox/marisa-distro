/**
 * 包级测试配置（P3 自包含 workspace 形态）：独立于根配置运行本包 tests/
 * 套件；@r05en1cu/* 内部包经显式 alias 解析到仓库内源码（避免 lib 产物
 * 双实例），@deepseek-ai/* 官方包经 node_modules（公开 registry）解析。
 * test/eb 假设验证套件保持独立配置（test/eb/vitest.config.ts，刻意走
 * node_modules lib 产物）。
 */
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@r05en1cu/dsh-mygo/invariant': here('src/invariant.ts'),
      '@r05en1cu/dsh-mygo': here('src/index.ts'),
      '@r05en1cu/dsh-mygo-api/invariant': here('../../core/mygo-api/src/invariant.ts'),
      '@r05en1cu/dsh-mygo-api': here('../../core/mygo-api/src/index.ts'),
    },
  },
  test: {
    root: here('.'),
    include: ['tests/**/*.spec.ts'],
    // extension-mygo-rdb.spec.ts 以 process.cwd() 拼接临时目录，仅仓库根
    // 运行成立（mygo-rdb 本地修正文件，按用户裁决不修改）；全量套件仍覆盖。
    exclude: ['tests/extension-mygo-rdb.spec.ts'],
    environment: 'node',
    pool: 'forks',
    // P4：服务 init 会写用户级实例登记处（~/.dsh-mygo）；测试统一把
    // MYGO_USER_DIR 重定向到临时目录，严禁碰真实用户级目录。
    env: {
      MYGO_USER_DIR: join(tmpdir(), 'mygo-vitest-user-dir'),
    },
  },
})
