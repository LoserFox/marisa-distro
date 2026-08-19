/**
 * mygo-panel 测试配置（rc.3 起建包级套件）：纯函数面（bridge-rows）直测，
 * 无宿主依赖。面板包不装 vitest（其 dsh-client-* devDeps 的传递依赖
 * 404 未公开发布，任何解析变动都会撞墙）——本配置刻意不 import
 * 'vitest/config'（面板解析链无 vitest 顶层链接），plain object 直出；
 * 经根级提升的 vitest 二进制运行（test 脚本注释见 DEV-GUIDE）。
 */
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default {
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
}
