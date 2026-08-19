/**
 * E2E 夹具语料库注册表（验证轮 §1）：六类真实来源 + 信任分级 + 人工审阅记录。
 * 来源根默认 `$DSH_DEV/dsh-external-src`（可用 DSH_E2E_CORPUS_ROOT 覆盖）。
 * 体系外仓库（F2/F5/F6）已人工审阅入口文件；MUST NOT 执行其 install 脚本。
 * @module @r05en1cu/dsh-mygo/tests/e2e/corpus
 */

import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

/** 语料根：dsh_dev 下 dsh-external-src；可用 DSH_E2E_CORPUS_ROOT 覆盖。 */
export function corpusRoot(): string {
  const env = process.env.DSH_E2E_CORPUS_ROOT
  if (env !== undefined && env !== '') return env
  // tests/e2e → mygo/tests → mygo → cordis → packages → 0811 → dsh_dev
  return fileURLToPath(new URL('../../../../../../dsh-external-src/', import.meta.url)).replace(/\/$/, '')
}

/** dsh_dev 根（fabric 在 dsh-external-src 的兄弟目录）。 */
export function devRoot(): string {
  return fileURLToPath(new URL('../../../../../../', import.meta.url)).replace(/\/$/, '')
}

export type CorpusCategory = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'

export interface CorpusPlugin {
  readonly category: CorpusCategory
  readonly id: string
  /** npm 包名（真实 package.json name）。 */
  readonly name: string
  /** 仓库绝对路径。 */
  readonly dir: string
  /** 相对仓库根的入口（真实代码）。 */
  readonly entry: string
  /** 体系外插件缺少 dsh.mygo 时，打包注入的 mygo manifest 覆盖（不改仓库）。 */
  readonly manifestOverlay?: Record<string, unknown>
  /** 打包进 tarball 的部件（缺省 npm 包形态全集；F1 只带 lib 避免 bundle-scan 误伤 src）。 */
  readonly packParts?: readonly string[]
  /** 打包期版本覆盖（用于同一包发布多版本的 registry 形态；不改仓库文件）。 */
  readonly versionOverride?: string
  /**
   * 打包期 package.json 顶层覆盖（用于清理本地 monorepo 的 workspace:^ 区间等
   * 非发布形态声明；不改仓库文件）。
   */
  readonly packageJsonOverlay?: Record<string, unknown>
  readonly trust: 'trusted' | 'reviewed'
  readonly reviewNote: string
}

function base(): string {
  return corpusRoot()
}

/** 语料库（F1-F6）。人工审阅记录见 reviewNote。 */
export const CORPUS: readonly CorpusPlugin[] = [
  {
    category: 'F1',
    id: 'dsh-cordis-fabric',
    name: '@deepseek-ai/dsh-cordis-fabric',
    // P7-B7：从根载包（三包拆分前的遗留 lib 构建，依赖 node_modules 遗留
    // 提升链接解析，脆弱）切到 cordis-fabric 包自身——包内 lib 与
    // node_modules 自包含，解析不依赖仓根状态。
    dir: `${devRoot()}/fabric/packages/cordis-fabric`,
    entry: 'lib/index.js',
    packParts: ['package.json', 'lib', 'src'],
    // 语料契约版本钉 0.0.2（包自身 0.0.1-rc.1 漂移不影响 registry 身份）。
    versionOverride: '0.0.2',
    manifestOverlay: {
      id: 'dsh-cordis-fabric',
      version: '0.0.2',
      entry: 'lib/index.js',
      core: '*',
      requires: {},
    },
    trust: 'trusted',
    reviewNote: '朋友的 fabric/mixin 插件仓库（cordis-fabric 包：lib 产物 + node_modules 齐备）；trusted 直接运行；P7 起语料指到包自身（根载包遗留 lib 废弃）',
  },
  {
    category: 'F2',
    id: 'dsh-tool-time',
    name: '@deepseek-ai/dsh-tool-time',
    dir: `${base()}/dsh-tool-time`,
    entry: 'src/index.ts',
    trust: 'reviewed',
    reviewNote: '已审阅 src/index.ts：tools 注册 + module-level import defineTool（ctx.<prop> + 模块导入双样本）；无 install 脚本',
    manifestOverlay: { entry: 'src/index.ts', core: '*' },
  },
  {
    category: 'F2',
    id: 'zotero-wave-rag',
    name: '@dsh-external/zotero-wave-rag',
    dir: `${base()}/zotero-wave-rag`,
    entry: 'src/index.ts',
    trust: 'reviewed',
    reviewNote: '已审阅 src/index.ts：tools 注册 + module imports；engines.dsh >=0.0.1（harvester 信号样本）；无 install 脚本',
    manifestOverlay: { entry: 'src/index.ts', core: '*', requires: {} },
  },
  {
    category: 'F2',
    id: 'dsh-vision',
    name: '@dsh-external/dsh-vision',
    dir: `${base()}/dsh-vision`,
    entry: 'src/index.ts',
    trust: 'reviewed',
    reviewNote: '已审阅 src/index.ts：tools/systemPrompt 注入 + module imports；仅调用工具时触网；无 install 脚本',
    manifestOverlay: { entry: 'src/index.ts', core: '*', requires: {} },
  },
  {
    category: 'F2',
    id: 'dsh-live-stats',
    name: '@dsh-external/live-stats',
    dir: `${base()}/dsh-live-stats`,
    entry: 'src/index.ts',
    trust: 'reviewed',
    reviewNote: '已审阅 src/index.ts：sessionProjections 注入 + module imports；无 install 脚本',
    manifestOverlay: { entry: 'src/index.ts', core: '*', requires: {} },
  },
  {
    category: 'F2',
    id: 'dsh-gh-bridge',
    name: '@dsh-external/gh-bridge',
    dir: `${base()}/dsh-gh-bridge`,
    entry: 'src/index.ts',
    trust: 'reviewed',
    reviewNote: '已审阅 src/index.ts：tools 注入 + module imports（yaml 依赖已由语料 node_modules 提供）；无 install 脚本',
    manifestOverlay: { entry: 'src/index.ts', core: '*', requires: {} },
  },
  {
    category: 'F2',
    id: 'dsh-cc-tui',
    name: '@deepseek-ai/dsh-cc-tui',
    dir: `${base()}/dsh-cc-tui`,
    entry: '', // 仅元数据样本：dependencies 嵌套 @deepseek-ai/dsh-working-activity（S8 双存在）
    trust: 'reviewed',
    reviewNote: '已审阅 package.json：npm 依赖嵌套插件样本（census M6/R10）；无安装/挂载',
  },
  {
    category: 'F3',
    id: 'plugin-template',
    name: '@your-scope/dsh-plugin-template',
    dir: `${base()}/plugin-template`,
    entry: 'src/index.ts',
    manifestOverlay: { id: 'plugin-template', entry: 'src/index.ts', core: '*' },
    trust: 'trusted',
    reviewNote: '官方 plugin-template@2da8230（npm 强兼容形态）；E2E 从模板生成新插件实例',
  },
  {
    category: 'F4',
    id: 'dsh-vibe-mode',
    name: '@dsh-external/dsh-vibe-mode',
    dir: `${base()}/dsh-vibe-mode`,
    entry: 'lib/index.js',
    packParts: ['package.json', 'lib'],
    trust: 'trusted',
    reviewNote: '参考实现：dsh.mygo 规范写法（depends dsh-voice-chat + requires voice-chat）',
    // fixture 修正（2026-08-13 范围重塑）：真实仓库的顶层 depends 已从 manifest
    // v3 移除；按语料机制注入 compatibility 等价声明（不改仓库，语义载荷保持）。
    manifestOverlay: {
      entry: 'lib/index.js',
      core: '*',
      requires: { 'voice-chat': '>=0.1.0' },
      compatibility: { depends: { 'dsh-voice-chat': '>=0.1.0' } },
    },
  },
  {
    category: 'F4',
    id: 'dsh-voice-chat',
    name: '@dsh-external/dsh-voice-chat',
    dir: fileURLToPath(new URL('../fixtures/e2e/corpus/dsh-voice-chat/', import.meta.url)).replace(/\/$/, ''),
    entry: 'src/index.ts',
    manifestOverlay: { entry: 'src/index.ts', core: '*' },
    trust: 'trusted',
    reviewNote: '真实 dsh-voice-chat 仓库不在 90 快照；按 F4 服务契约构造的占位提供者（fixture），满足 depends 与 S4 三态',
  },
  {
    category: 'F4',
    id: 'dsh-voice-chat-01',
    name: '@dsh-external/dsh-voice-chat',
    dir: fileURLToPath(new URL('../fixtures/e2e/corpus/dsh-voice-chat/', import.meta.url)).replace(/\/$/, ''),
    entry: 'src/index.ts',
    versionOverride: '0.1.0',
    manifestOverlay: { entry: 'src/index.ts', core: '*' },
    trust: 'trusted',
    reviewNote: 'voice-chat 0.1.0 历史版本（T22 多候选确定性：真实图出现同 id 多版本裁决）',
  },
  {
    category: 'F5',
    id: 'dsh-pty-windows',
    name: '@dsh-external/dsh-pty-windows',
    dir: `${base()}/dsh-pty-windows`,
    entry: 'index.mjs',
    trust: 'reviewed',
    reviewNote: '已审阅 index.mjs：legacy dsh.plugin.json + win32 门（POSIX no-op）；无 install 脚本',
  },
  {
    category: 'F6',
    id: 'dsh-101',
    name: '@dsh-external/dsh-101',
    dir: `${base()}/dsh-101`,
    entry: '', // 仅作 bundle patch 展开样本（无构建产物，不安装/挂载）
    trust: 'reviewed',
    reviewNote: '已审阅 cordis.patch.yml：33/80 主流 profile bundle 形态；无 lib 产物，仅 patch 展开断言',
  },
]

/** 按类别取语料。 */
export function corpusOf(category: CorpusCategory): readonly CorpusPlugin[] {
  return CORPUS.filter(item => item.category === category)
}

/** 加载一个语料入口为模块对象（真实代码；vitest transform）。 */
export async function loadEntry(plugin: CorpusPlugin): Promise<unknown> {
  if (plugin.entry === '') throw new Error(`${plugin.id} 无入口`)
  return import(pathToFileURL(`${plugin.dir}/${plugin.entry}`).href)
}
