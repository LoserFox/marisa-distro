/**
 * 假设验证实验专用 vitest 配置：只包含 test/eb 目录，
 * 与主套件（tests/**）隔离；依赖经仓库 node_modules 解析到 lib 产物
 * （先 pnpm run build 再跑本套件）。
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/cordis/mygo/test/eb/**/*.spec.ts'],
    // P4：用户级实例登记处重定向到临时目录（同主套件口径）。
    env: {
      MYGO_USER_DIR: join(tmpdir(), 'mygo-vitest-user-dir'),
    },
  },
})
