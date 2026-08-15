// client/character.mjs 单测（node:test）。归属：角色清单解析改动跑本文件。
// v5：删 emoji 降级——stateOf 缺状态返回 undefined（调用方占位），isKnownState 基于 STATE_NAMES。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ROLE_ID, ROLE_ID_RE, parseCharacters, listCharacters, defaultCharacter,
  getCharacter, stateOf, isKnownState,
} from '../.dsh-plugin/client/character.mjs'

const OLD_MANIFEST = {
  states: { idle: { sheet: 'idle.png', frames: 3, fps: 2, loop: true } },
}
const NEW_MANIFEST = {
  characters: {
    'whale-girl': { meta: { stageSize: 110 }, states: { idle: { sheet: 'idle.png', frames: 3, fps: 2, loop: true } } },
    cat: { meta: { stageSize: 96 }, states: { walk: { sheet: 'walk.png', frames: 3, fps: 6, loop: true } } },
  },
  default: 'cat',
}

test('旧格式 states 简写 → whale-girl 单角色（兼容读）', () => {
  const { characters, defaultId } = parseCharacters(OLD_MANIFEST)
  assert.equal(defaultId, DEFAULT_ROLE_ID)
  assert.deepEqual(Object.keys(characters), [DEFAULT_ROLE_ID])
  assert.ok('idle' in characters[DEFAULT_ROLE_ID].states)
})

test('新格式 characters + default', () => {
  const { characters, defaultId } = parseCharacters(NEW_MANIFEST)
  assert.deepEqual(Object.keys(characters), ['whale-girl', 'cat'])
  assert.equal(defaultId, 'cat')
  assert.equal(characters.cat.meta.stageSize, 96)
})

test('default 指向不存在角色时回退首个角色', () => {
  const m = { characters: { a: { states: {} }, b: { states: {} } }, default: 'nope' }
  assert.equal(defaultCharacter(m), 'a')
})

test('缺省/损坏 manifest 安全回退', () => {
  assert.equal(parseCharacters(undefined).defaultId, DEFAULT_ROLE_ID)
  assert.equal(parseCharacters(null).defaultId, DEFAULT_ROLE_ID)
  assert.equal(parseCharacters({}).defaultId, DEFAULT_ROLE_ID)
  assert.deepEqual(listCharacters(undefined), [DEFAULT_ROLE_ID])
})

test('listCharacters / defaultCharacter / getCharacter', () => {
  assert.deepEqual(listCharacters(NEW_MANIFEST), ['whale-girl', 'cat'])
  assert.equal(defaultCharacter(NEW_MANIFEST), 'cat')
  assert.equal(getCharacter(NEW_MANIFEST, 'cat')?.meta.stageSize, 96)
  assert.equal(getCharacter(NEW_MANIFEST, 'nope'), null)
})

test('stateOf：缺状态返回 undefined（调用方占位，不再 emoji 降级）', () => {
  const cat = getCharacter(NEW_MANIFEST, 'cat')
  assert.ok(stateOf(cat, 'walk'))
  assert.equal(stateOf(cat, 'idle'), undefined) // cat 只有 walk
  assert.equal(stateOf(null, 'walk'), undefined)
})

test('isKnownState：STATE_NAMES 权威集合成员为真，未知为假', () => {
  assert.equal(isKnownState('idle'), true)
  assert.equal(isKnownState('teleport'), false)
})

test('ROLE_ID_RE：合法 id 通过，非法拒绝（URL 注入面）', () => {
  assert.ok(ROLE_ID_RE.test('whale-girl'))
  assert.ok(ROLE_ID_RE.test('cat2'))
  assert.ok(!ROLE_ID_RE.test('a/b'))
  assert.ok(!ROLE_ID_RE.test('..'))
  assert.ok(!ROLE_ID_RE.test('a b'))
  assert.ok(!ROLE_ID_RE.test(''))
})
