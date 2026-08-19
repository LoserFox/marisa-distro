/**
 * T48：报告渲染快照（每个 code 至少一个用例；字节级断言）。
 * @module @r05en1cu/dsh-mygo-cli/tests/render
 */

import { describe, expect, it } from 'vitest'
import type { ResolutionReport, ServiceResolutionReport } from '@r05en1cu/dsh-mygo'
import { jsonOutput, renderInstallSuccess, renderReportHuman, renderRestoreSuccess, renderUsage } from '../src/render.ts'

function resolveFailed(): ResolutionReport {
  return {
    code: 'resolve-failed',
    summary: 'foo 没有满足约束的候选版本',
    scope: 'package',
    cycles: [],
    conflicts: [{
      plugin: 'foo',
      constraint: { kind: 'depends', target: 'bar', range: '^1.0.0' },
      chain: ['root', 'foo'],
      candidates: [{ version: '0.9.0', rejected: ['区间 ^1.0.0 不满足'] }],
      actions: ['安装 bar 到满足 ^1.0.0 的版本'],
    }],
  }
}

function packHashMismatch(): ResolutionReport {
  return {
    code: 'pack-hash-mismatch',
    summary: 'vendored 文件哈希校验失败',
    scope: 'pack',
    cycles: [],
    conflicts: [{
      plugin: '<pack>',
      constraint: { kind: 'pack', target: 'files/0.tgz', range: 'sha512' },
      chain: ['<pack>'],
      candidates: [{ version: '<manifest>', rejected: ['sha512 失配（期望 0a2c…，实际 9f31…）'] }],
      actions: ['重新打包或从可信来源获取 pack'],
    }],
  }
}

function packInvalid(): ResolutionReport {
  return {
    code: 'pack-invalid',
    summary: 'pack 清单自校验失败（manifestSha256 失配）',
    scope: 'pack',
    cycles: [],
    conflicts: [{
      plugin: '<pack>',
      constraint: { kind: 'pack', target: 'mygo-pack.json', range: 'manifestSha256' },
      chain: ['<pack>'],
      candidates: [{ version: '<manifest>', rejected: ['清单哈希失配（期望 349e6476…）'] }],
      actions: ['重新打包或从可信来源获取 pack'],
    }],
  }
}

function manifestInvalid(): ResolutionReport {
  return {
    code: 'manifest-invalid',
    summary: '插件入口非法：entry 不得逃出包目录',
    scope: 'package',
    cycles: [],
    conflicts: [{
      plugin: 'evil',
      constraint: { kind: 'entry', target: 'self', range: 'entry' },
      chain: ['evil'],
      candidates: [{ version: '1.0.0', rejected: ['dsh.mygo.entry: entry 不得逃出包目录（../x.js）'] }],
      actions: ['修复 evil 的入口声明 ../x.js'],
    }],
  }
}

function serviceReport(): ServiceResolutionReport {
  return {
    code: 'policy-rejected',
    summary: 'voice 服务缺少提供者',
    scope: 'service',
    cycles: [],
    conflicts: [{
      service: 'voice-chat',
      constraint: { kind: 'requires', target: 'voice-chat', range: '^1.0.0' },
      chain: ['vibe-mode', 'voice-chat'],
      candidates: [{ plugin: 'voice-impl', version: '1.1.0', state: 'active' }],
      actions: ['安装/启用提供 voice-chat 的插件'],
    }],
  }
}

/** restore 成功输出（含告警）的固定字节序列（守则禁 emoji：警告前缀为 [warn]）。 */
function restoreSuccessWithWarnings(): string {
  return renderRestoreSuccess('web', 3, ['社区依赖声明 2 条（未钉版）', 'peerDependencies 区间告警（dsh >=0.0.1-rc.1）'])
}

describe('报告渲染（T48）', () => {
  it('resolve-failed 渲染为固定字节序列', () => {
    expect(renderReportHuman(resolveFailed())).toBe([
      '✗ resolve-failed：foo 没有满足约束的候选版本',
      '  作用域 package',
      '',
      '  冲突 1/1 · 插件 foo',
      '    约束 depends bar（^1.0.0）',
      '    链路 root → foo',
      '    候选集：',
      '      0.9.0 — 区间 ^1.0.0 不满足',
      '    建议 安装 bar 到满足 ^1.0.0 的版本',
      '',
    ].join('\n'))
  })

  it('pack-hash-mismatch 渲染并指认文件', () => {
    expect(renderReportHuman(packHashMismatch())).toBe([
      '✗ pack-hash-mismatch：vendored 文件哈希校验失败',
      '  作用域 pack',
      '  文件 files/0.tgz',
      '',
      '  冲突 1/1 · 插件 <pack>',
      '    约束 pack files/0.tgz（sha512）',
      '    链路 <pack>',
      '    候选集：',
      '      <manifest> — sha512 失配（期望 0a2c…，实际 9f31…）',
      '    建议 重新打包或从可信来源获取 pack',
      '',
    ].join('\n'))
  })

  it('pack-invalid 渲染并指认清单文件', () => {
    expect(renderReportHuman(packInvalid())).toContain('✗ pack-invalid：pack 清单自校验失败（manifestSha256 失配）')
    expect(renderReportHuman(packInvalid())).toContain('  文件 mygo-pack.json')
  })

  it('manifest-invalid 渲染', () => {
    const text = renderReportHuman(manifestInvalid())
    expect(text).toContain('✗ manifest-invalid：插件入口非法：entry 不得逃出包目录')
    expect(text).toContain('    约束 entry self（entry）')
    expect(text).toContain('    建议 修复 evil 的入口声明 ../x.js')
  })

  it('service 报告渲染提供者候选状态', () => {
    const text = renderReportHuman(serviceReport())
    expect(text).toContain('✗ policy-rejected：voice 服务缺少提供者')
    expect(text).toContain('  冲突 1/1 · 服务 voice-chat')
    expect(text).toContain('      voice-impl@1.1.0 [active]')
    expect(text).toContain('    建议 安装/启用提供 voice-chat 的插件')
  })

  it('restore 成功含告警渲染为固定字节序列（警告前缀 [warn]）', () => {
    expect(restoreSuccessWithWarnings()).toBe([
      '✓ 已还原 → profile web：3 个插件',
      '  [warn] 社区依赖声明 2 条（未钉版）',
      '  [warn] peerDependencies 区间告警（dsh >=0.0.1-rc.1）',
      '',
    ].join('\n'))
  })

  it('--json 信封只含一个 JSON 文档', () => {
    const json = jsonOutput('restore', { ok: false, report: packHashMismatch() })
    const parsed = JSON.parse(json) as { ok: boolean; command: string; report: ResolutionReport }
    expect(parsed).toEqual({ ok: false, command: 'restore', report: packHashMismatch() })
    expect(json.endsWith('\n')).toBe(true)
  })

  it('用法文本覆盖三子命令', () => {
    for (const topic of ['pack', 'restore', 'init'] as const) {
      expect(renderUsage(topic)).toContain(`dsh --profile <profile> mygo ${topic}`)
    }
    expect(renderUsage()).toContain('子命令：')
  })
})

describe('install/uninstall 激活态文案（r7 对齐面板）', () => {
  it('install：live 轨与 boot 轨文案分野', () => {
    const live = renderInstallSuccess('install', 'web', [], { live: true })
    expect(live).toContain('运行期重放即生效')
    const boot = renderInstallSuccess('install', 'web', ['@deepseek-ai/dsh-base'])
    expect(boot).toContain('重启实例后生效')
    expect(boot).toContain('profile bundle 层：@deepseek-ai/dsh-base')
  })

  it('uninstall：剥除 live 块时提示重放/dispose 语义', () => {
    const stripped = renderInstallSuccess('uninstall', 'web', [], { liveStripped: true })
    expect(stripped).toContain('live 受管块已剥除')
    const plain = renderInstallSuccess('uninstall', 'web', [])
    expect(plain).not.toContain('live 受管块')
  })
})
