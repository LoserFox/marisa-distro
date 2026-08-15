import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { flattenDiagnosticMessageText, parseConfigFileTextToJson } from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const eslintCli = fileURLToPath(new URL('../node_modules/eslint/bin/eslint.js', import.meta.url))
const oxlintCli = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function runStagedFormatter(paths: readonly string[]) {
  return spawnSync(process.execPath, [eslintCli, '--config', 'eslint.format.config.mjs', '--fix', '--no-warn-ignored', ...paths], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

function runOxlint(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [oxlintCli, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
}

function normalizedOutput(result: ReturnType<typeof runOxlint>): string {
  return `${result.stdout}${result.stderr}`.replaceAll('\\', '/')
}

async function writeContractConfig(suffix: string): Promise<string> {
  const path = join(repositoryRoot, `.oxlintrc.contract-${suffix}.json`)
  await writeFile(path, JSON.stringify({ extends: ['./.oxlintrc.json'], ignorePatterns: [] }))
  return path
}

describe('Oxlint executable contract', () => {
  it('discovers the owning TypeScript project for every file class', async () => {
    const suffix = randomUUID()
    const configPath = await writeContractConfig(suffix)
    const probes = [
      ['host package source', 'packages/fs/fs-policy/src', 'packages/fs/fs-policy/tsconfig.json'],
      ['host package test', 'packages/fs/fs-policy/tests', 'tsconfig.host.json'],
      ['client package source', 'packages/client/ui-primitives/src', 'packages/client/ui-primitives/tsconfig.json'],
      ['client package test', 'packages/client/ui-trajectory/tests', 'tsconfig.client.json'],
      ['example', 'examples/headless-agent/tests', 'tsconfig.host.json'],
      ['website', 'website', 'tsconfig.host.json'],
    ] as const
    const source = `export function probePromise(): Promise<void> {
  return Promise.resolve()
}

probePromise()
`

    try {
      const paths: Array<readonly [label: string, path: string, tsconfig: string]> = []
      for (const [label, parent, tsconfig] of probes) {
        const path = join(repositoryRoot, parent, `oxlint-contract-${suffix}.ts`)
        await writeFile(path, source)
        paths.push([label, relative(repositoryRoot, path), tsconfig])
      }
      const clientScript = 'scripts/client-bundle-purity.spec.ts'

      const result = runOxlint([
        '--config',
        relative(repositoryRoot, configPath),
        '--format',
        'unix',
        ...paths.map(([, path]) => path),
        clientScript,
      ], { OXC_LOG: 'debug' })
      const output = normalizedOutput(result)

      expect(result.error).toBeUndefined()
      expect(result.status, output).toBe(1)
      for (const [label, path, tsconfig] of paths) {
        expect(output, label).toContain(`${path.replaceAll('\\', '/')}:5:1: Promises must be awaited`)
        expect(output, `${label} project`).toContain(
          `Got tsconfig for file ${join(repositoryRoot, path).replaceAll('\\', '/')}: ${join(repositoryRoot, tsconfig).replaceAll('\\', '/')}`,
        )
      }
      expect(output.match(/typescript\(no-floating-promises\)/g)).toHaveLength(probes.length)
      expect(output, 'client aggregate script project').toContain(
        `Got tsconfig for file ${join(repositoryRoot, clientScript).replaceAll('\\', '/')}: ${join(repositoryRoot, 'tsconfig.client.json').replaceAll('\\', '/')}`,
      )
      expect(output).not.toContain('Unmatched file:')
    } finally {
      await Promise.all([
        ...probes.map(([, parent]) => rm(join(repositoryRoot, parent, `oxlint-contract-${suffix}.ts`), { force: true })),
        rm(configPath, { force: true }),
      ])
    }
  }, 20_000)

  it('runs JavaScript compatibility and nursery rules', async () => {
    const suffix = randomUUID()
    const configPath = await writeContractConfig(suffix)
    const path = join(repositoryRoot, 'scripts', `oxlint-contract-${suffix}.ts`)
    const source = `export function firstProbe(): number {
  const first = 1
  const second = 2
  return first + second
}

export function secondProbe(): number {
  const first = 1
  const second = 2
  return first + second
}

export function hasValue(value: string): boolean {
  return value !== undefined
}

export const longProbe = 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1
`

    try {
      await writeFile(path, source)
      const result = runOxlint([
        '--config',
        relative(repositoryRoot, configPath),
        '--format',
        'unix',
        relative(repositoryRoot, path),
      ])
      const output = normalizedOutput(result)

      expect(result.error).toBeUndefined()
      expect(result.status, output).toBe(1)
      expect(output).toContain('@stylistic(max-len)')
      expect(output).toContain('sonarjs(no-identical-functions)')
      expect(output).toContain('typescript(no-unnecessary-condition)')
    } finally {
      await Promise.all([
        rm(path, { force: true }),
        rm(configPath, { force: true }),
      ])
    }
  }, 20_000)

  it('keeps formatter rules aligned with Oxlint validation', async () => {
    const oxlintPath = join(repositoryRoot, '.oxlintrc.json')
    const result = parseConfigFileTextToJson(oxlintPath, await readFile(oxlintPath, 'utf8'))
    if (result.error !== undefined) {
      throw new Error(flattenDiagnosticMessageText(result.error.messageText, '\n'))
    }
    const parsed = result.config as unknown
    if (!isRecord(parsed) || !isUnknownArray(parsed.overrides)) {
      throw new Error('.oxlintrc.json must contain an overrides array')
    }
    const stylisticOverride = parsed.overrides.find((value: unknown) =>
      isRecord(value) && isRecord(value.rules) && '@stylistic/max-len' in value.rules)
    if (!isRecord(stylisticOverride) || !isRecord(stylisticOverride.rules)) {
      throw new Error('.oxlintrc.json must contain the @stylistic validator override')
    }
    const validatorRules = { ...stylisticOverride.rules }
    const maxLen = validatorRules['@stylistic/max-len']
    delete validatorRules['@stylistic/max-len']

    const formatterUrl = pathToFileURL(join(repositoryRoot, 'eslint.format.config.mjs')).href
    const formatterModule: unknown = await import(formatterUrl) as unknown
    if (!isRecord(formatterModule) || !isUnknownArray(formatterModule.default)) {
      throw new Error('eslint.format.config.mjs must default-export a config array')
    }
    const formatterOverride = formatterModule.default.find((value: unknown) => isRecord(value) && isRecord(value.rules))
    if (!isRecord(formatterOverride) || !isRecord(formatterOverride.rules)) {
      throw new Error('eslint.format.config.mjs must contain a rules object')
    }

    expect(validatorRules).toStrictEqual(formatterOverride.rules)
    expect(maxLen).toStrictEqual(['error', { code: 140, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }])
  })

  it('reports an unused suppression', async () => {
    const suffix = randomUUID()
    const configPath = await writeContractConfig(suffix)
    const path = join(repositoryRoot, 'scripts', `oxlint-contract-${suffix}.ts`)

    try {
      await writeFile(path, '// oxlint-disable-next-line no-console\nexport const value = 1\n')
      const result = runOxlint([
        '--config',
        relative(repositoryRoot, configPath),
        '--format',
        'unix',
        relative(repositoryRoot, path),
      ])
      const output = normalizedOutput(result)

      expect(result.error).toBeUndefined()
      expect(result.status, output).toBe(0)
      expect(output).toContain('Unused oxlint-disable directive')
    } finally {
      await Promise.all([
        rm(path, { force: true }),
        rm(configPath, { force: true }),
      ])
    }
  })

  it('accepts an ignored-only staged selection', () => {
    const result = runOxlint([
      '--fix',
      '--no-error-on-unmatched-pattern',
      'scripts/install-lefthook.mjs',
    ])

    expect(result.error).toBeUndefined()
    expect(result.status, normalizedOutput(result)).toBe(0)
  })

  it('keeps staged validation project-free while preserving source rules', async () => {
    const configPath = join(repositoryRoot, '.oxlintrc.staged.json')
    const result = parseConfigFileTextToJson(configPath, await readFile(configPath, 'utf8'))
    if (result.error !== undefined) {
      throw new Error(flattenDiagnosticMessageText(result.error.messageText, '\n'))
    }
    expect(result.config).toMatchObject({
      extends: ['./.oxlintrc.json'],
      options: { typeAware: false },
    })

    const suffix = randomUUID()
    const path = join(repositoryRoot, 'scripts', `staged-lint-probe-${suffix}.ts`)
    try {
      await writeFile(path, 'export const value={answer:1};\n')
      const lint = runOxlint([
        '--config',
        relative(repositoryRoot, configPath),
        '--format',
        'unix',
        relative(repositoryRoot, path),
      ])
      const output = normalizedOutput(lint)

      expect(lint.error).toBeUndefined()
      expect(lint.status, output).toBe(1)
      expect(output).toContain('@stylistic')
      expect(output).not.toContain('typescript(')
    } finally {
      await rm(path, { force: true })
    }
  })

  it('applies staged stylistic fixes before Oxlint validation', async () => {
    const suffix = randomUUID()
    const configPath = await writeContractConfig(suffix)
    const directory = join(repositoryRoot, 'scripts', `.oxlint-contract-${suffix}`)
    const path = join(directory, 'fix.ts')

    try {
      await mkdir(directory, { recursive: true })
      await writeFile(path, 'const value={answer:1};  \nconsole.log(value)\n')

      const relativePath = relative(repositoryRoot, path)
      const formatResult = runStagedFormatter([relativePath])
      const lintResult = runOxlint(['--config', relative(repositoryRoot, configPath), '--fix', relativePath])

      expect(formatResult.error).toBeUndefined()
      expect(formatResult.status, normalizedOutput(formatResult)).toBe(0)
      expect(lintResult.error).toBeUndefined()
      expect(lintResult.status, normalizedOutput(lintResult)).toBe(0)
      await expect(readFile(path, 'utf8')).resolves.toBe('const value={ answer:1 }\nconsole.log(value)\n')
    } finally {
      await Promise.all([
        rm(directory, { recursive: true, force: true }),
        rm(configPath, { force: true }),
      ])
    }
  }, 20_000)
})
