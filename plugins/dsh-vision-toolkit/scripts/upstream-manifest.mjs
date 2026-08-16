#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const upstream = packageJson.dsh?.visionToolkit
const sourceRoot = join(root, 'vendor', 'agent-vision-toolkit')
const manifestPath = join(sourceRoot, 'UPSTREAM_MANIFEST.json')

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesBelow(path))
    else if (entry.isFile() && path !== manifestPath) files.push(path)
  }
  return files
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function snapshot(expectedFiles = new Map()) {
  const rows = []
  for (const path of (await filesBelow(sourceRoot)).sort()) {
    let bytes = await readFile(path)
    const manifestPath = relative(sourceRoot, path).split('\\').join('/')
    const expected = expectedFiles.get(manifestPath)
    if (expected !== undefined && (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)) {
      const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))
      if (normalized.length === expected.bytes && sha256(normalized) === expected.sha256) bytes = normalized
    }
    rows.push({
      path: manifestPath,
      bytes: bytes.length,
      sha256: sha256(bytes),
    })
  }
  const contentSha256 = sha256(Buffer.from(rows.map(row => `${row.path}\0${row.sha256}\n`).join('')))
  return {
    schemaVersion: 1,
    repository: upstream?.upstreamRepository,
    version: upstream?.upstreamVersion,
    commit: upstream?.upstreamCommit,
    contentSha256,
    files: rows,
  }
}

if (process.argv.includes('--write')) {
  const next = await snapshot()
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
  process.stdout.write(`wrote ${manifestPath}\n`)
} else {
  const current = JSON.parse(await readFile(manifestPath, 'utf8'))
  const expectedFiles = new Map(current.files.map(entry => [entry.path, entry]))
  const next = await snapshot(expectedFiles)
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    process.stderr.write('vendored agent-vision-toolkit snapshot differs from UPSTREAM_MANIFEST.json; run npm run upstream:manifest\n')
    process.exitCode = 1
  }
}
