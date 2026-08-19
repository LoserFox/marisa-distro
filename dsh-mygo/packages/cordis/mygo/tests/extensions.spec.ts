/**
 * P6 extension 登记表单元测试：登记/重复拒绝/注销幂等/确定性发现面 +
 * extensionViews 纯函数（启用态从 patch 层受管块推导、版本取依赖子集）。
 * @module @r05en1cu/dsh-mygo/tests/extensions
 */

import { describe, expect, it } from 'vitest'
import { ExtensionRegistry, extensionViews, type ExtensionRegistration } from '../src/extensions.ts'

function fabricRegistration(): ExtensionRegistration {
  return {
    id: 'fabric',
    kind: 'extension',
    source: 'github:dsh-external/fabric（git 子目录 spec 白名单过渡）',
    blockMarker: '# --- mygo managed extension (id:fabric) ---',
    packages: ['cordis-fabric', 'cordis-fabric-dsh'],
  }
}

describe('ExtensionRegistry（P6 扩展登记表）', () => {
  it('register/list：按 id 字典序；重复/非法登记拒绝', () => {
    const registry = new ExtensionRegistry()
    registry.register(fabricRegistration())
    expect(registry.list().map(item => item.id)).toEqual(['fabric'])
    expect(() => registry.register(fabricRegistration())).toThrow('重复登记拒绝')
    expect(() => registry.register({ ...fabricRegistration(), id: 'Bad' })).toThrow('非法 extension id')
    expect(() => registry.register({ ...fabricRegistration(), id: 'x', blockMarker: '' })).toThrow('缺 blockMarker')
  })

  it('注销器幂等且只注销同一实例', () => {
    const registry = new ExtensionRegistry()
    const dispose = registry.register(fabricRegistration())
    dispose()
    expect(registry.get('fabric')).toBeUndefined()
    dispose()
    registry.register(fabricRegistration())
    dispose()
    expect(registry.get('fabric')).toBeDefined()
  })
})

describe('extensionViews（启用态/版本视图推导）', () => {
  it('patch 层含受管块标记 → enabled；dependencies 子集 → versions', () => {
    const views = extensionViews([fabricRegistration()], {
      patchText: '# --- mygo managed extension (id:fabric) ---\n- insert: []\n',
      dependencies: { 'cordis-fabric': '1.0.0', 'other-pkg': '2.0.0' },
    })
    expect(views).toHaveLength(1)
    expect(views[0]?.enabled).toBe(true)
    expect(views[0]?.versions).toEqual({ 'cordis-fabric': '1.0.0' })
  })

  it('无受管块 → disabled；无依赖 → 空版本视图', () => {
    const views = extensionViews([fabricRegistration()], { patchText: '', dependencies: {} })
    expect(views[0]?.enabled).toBe(false)
    expect(views[0]?.versions).toEqual({})
  })
})
