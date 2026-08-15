/** Regression tests for bilingual snapshots, corpus scope, and structure. */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitBlobHash, storeGitBlob } from './translation-pairing-git.ts'
import {
  isTranslationScopeFile,
  pairAnchorOfArgument,
  parseTranslationMarkdown,
  parseTranslationPairingCliArgs,
  parseTranslationPairingManifest,
  translationStructureDiff,
  translationStructureSignature,
} from './translation-pairing.ts'

function signature(markdown: string) {
  return translationStructureSignature(parseTranslationMarkdown(markdown), 'counterpart.zh.md')
}

function gitSupportsObjectFormat(format: 'sha256'): boolean {
  const root = mkdtempSync(join(tmpdir(), 'dsh-git-object-format-'))
  try {
    return spawnSync('git', ['init', '--quiet', `--object-format=${format}`, root], {
      stdio: 'ignore',
    }).status === 0
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const supportsSha256ObjectFormat = gitSupportsObjectFormat('sha256')

describe('translation pairing snapshots', () => {
  it('stores exact uncommitted bytes for later recovery by object ID', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-translation-pairing-'))
    try {
      execFileSync('git', ['init', '--quiet', root], {
        env: { ...process.env, GIT_DEFAULT_HASH: 'sha1' },
      })
      const content = Buffer.from([0x75, 0x6e, 0x63, 0x6f, 0x6d, 0x6d, 0x69, 0x74, 0x74, 0x65, 0x64, 0x0a, 0xff])

      const objectId = storeGitBlob(root, content)

      expect(objectId).toBe(gitBlobHash(content))
      expect(execFileSync('git', [
        '-C', root, 'rev-parse', `refs/dsh/translation-pairing/snapshots/${objectId}`,
      ], { encoding: 'utf8' }).trim()).toBe(objectId)
      execFileSync('git', ['-C', root, 'gc', '--prune=now'])
      expect(execFileSync('git', ['-C', root, 'cat-file', '-p', objectId])).toEqual(content)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails before a sidecar can reference an unavailable object', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-translation-pairing-'))
    try {
      expect(() => storeGitBlob(root, Buffer.from('snapshot'))).toThrow('git hash-object -w --stdin failed')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails clearly when Git cannot be started', () => {
    const previousPath = process.env.PATH
    try {
      process.env.PATH = ''
      expect(() => storeGitBlob('.', Buffer.from('snapshot'))).toThrow('git hash-object -w --stdin failed')
    } finally {
      process.env.PATH = previousPath
    }
  })

  it.skipIf(!supportsSha256ObjectFormat)('rejects an object format that pairing records cannot represent', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-translation-pairing-'))
    try {
      execFileSync('git', ['init', '--quiet', '--object-format=sha256', root])
      expect(() => storeGitBlob(root, Buffer.from('snapshot'))).toThrow('returned unexpected object ID')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('translation pairing manifest', () => {
  it('accepts an exclusions-only manifest', () => {
    expect(parseTranslationPairingManifest(JSON.stringify({
      excluded: ['docs/generated/'],
    }))).toEqual({
      excluded: ['docs/generated/'],
    })
  })

  it.each([
    ['required', ['packages/README.md']],
    ['requiredClasses', ['readme']],
    ['requiredSince', '2026-07-14'],
  ] as const)('rejects obsolete policy field %s instead of accepting an inert requirement', (field, value) => {
    expect(() => parseTranslationPairingManifest(JSON.stringify({
      excluded: [],
      [field]: value,
    }))).toThrow(`unsupported field(s): ${field}; every in-scope document is required`)
  })

  it('rejects a missing or non-string exclusion list', () => {
    expect(() => parseTranslationPairingManifest('{}')).toThrow('excluded must be an array of strings')
    expect(() => parseTranslationPairingManifest(JSON.stringify({
      excluded: [42],
    }))).toThrow('excluded must be an array of strings')
  })
})

describe('translation scope discovery', () => {
  it.each([
    'README.md',
    'apps/cli/README.md',
    'future/subtree/readme.md',
    'packages/example/README.zh.md',
    'native/example/README.i18n.yaml',
    '.agents/notes/proposed/feature.md',
    'docs/guide.md',
    'python/guide.md',
  ])('includes %s', (file) => {
    expect(isTranslationScopeFile(file)).toBe(true)
  })

  it.each([
    'packages/example/guide.md',
    'examples/tutorial.md',
    'website/reference.md',
    'packages/example/README.txt',
    'vendor/example/README.md',
    'packages/example/node_modules/dependency/README.md',
    'packages/example/lib/README.md',
    'coverage/report/README.md',
    'python/sdk-runtime/src/deepseek_harness_runtime/runtime/dsh-jsonrpc-agent-macos-arm64/README.md',
    'python/sdk-runtime/src/deepseek_harness_runtime/runtime/node/README.md',
  ])('excludes non-source or non-README path %s', (file) => {
    expect(isTranslationScopeFile(file)).toBe(false)
  })
})

describe('translation structural signature', () => {
  it('accepts matching list kinds, starts, and item counts', () => {
    const source = signature('3. One\n4. Two\n\n- A\n- B\n')
    const counterpart = signature('3. 一\n4. 二\n\n- 甲\n- 乙\n')
    expect(translationStructureDiff(source, counterpart)).toEqual([])
  })

  it('rejects an altered ordered-list start', () => {
    const source = signature('3. One\n4. Two\n\n- A\n- B\n')
    const counterpart = signature('1. 一\n2. 二\n\n- 甲\n- 乙\n')
    expect(translationStructureDiff(source, counterpart)).toEqual([
      'list (kind, start, item count) #1 diverges between the pair: "ordered:start=3:items=2" vs "ordered:start=1:items=2"',
    ])
  })

  it('rejects a missing list item', () => {
    const source = signature('- A\n- B\n')
    const counterpart = signature('- 甲\n')
    expect(translationStructureDiff(source, counterpart)).toEqual([
      'list (kind, start, item count) #1 diverges between the pair: "bullet:items=2" vs "bullet:items=1"',
    ])
  })

  it('rejects altered table row or column counts', () => {
    const source = signature('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n')
    const counterpart = signature('| 甲 | 乙 |\n|---|---|\n| 一 | 二 |\n')
    expect(translationStructureDiff(source, counterpart)).toEqual([
      'table (row x column count) #1 diverges between the pair: "3x2" vs "2x2"',
    ])
  })
})

describe('pair CLI arguments', () => {
  it('normalizes any pair file or bare stem to the English anchor', () => {
    expect(pairAnchorOfArgument('docs/foo.md')).toBe('docs/foo.md')
    expect(pairAnchorOfArgument('docs/foo.zh.md')).toBe('docs/foo.md')
    expect(pairAnchorOfArgument('docs/foo.i18n.yaml')).toBe('docs/foo.md')
    expect(pairAnchorOfArgument('docs/foo')).toBe('docs/foo.md')
    expect(pairAnchorOfArgument('.\\docs\\foo.zh.md')).toBe('docs/foo.md')
  })

  it('scopes a check to named pairs and dedupes the three spellings', () => {
    expect(parseTranslationPairingCliArgs(['docs/foo.zh.md', 'docs/foo.i18n.yaml', 'docs/bar.md'])).toEqual({
      mode: 'check',
      scope: 'pairs',
      anchors: ['docs/bar.md', 'docs/foo.md'],
    })
    expect(parseTranslationPairingCliArgs([])).toEqual({ mode: 'check', scope: 'corpus', anchors: [] })
  })

  it('requires --write to name confirmed pairs or opt into --all', () => {
    expect(() => parseTranslationPairingCliArgs(['--write'])).toThrow('requires the pair(s) you confirmed')
    expect(parseTranslationPairingCliArgs(['--write', 'docs/foo.md'])).toEqual({
      mode: 'write',
      scope: 'pairs',
      anchors: ['docs/foo.md'],
    })
    expect(parseTranslationPairingCliArgs(['--write', '--all'])).toEqual({ mode: 'write', scope: 'corpus', anchors: [] })
    expect(() => parseTranslationPairingCliArgs(['--write', '--all', 'docs/foo.md'])).toThrow('not both')
  })

  it('keeps --list corpus-only and rejects unknown flags', () => {
    expect(parseTranslationPairingCliArgs(['--list'])).toEqual({ mode: 'list', scope: 'corpus', anchors: [] })
    expect(() => parseTranslationPairingCliArgs(['--list', 'docs/foo.md'])).toThrow('takes no other flags or paths')
    expect(() => parseTranslationPairingCliArgs(['--all'])).toThrow('--all only applies to --write')
    expect(() => parseTranslationPairingCliArgs(['--frobnicate'])).toThrow('unknown flag(s): --frobnicate')
  })
})
