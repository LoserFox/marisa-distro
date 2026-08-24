/**
 * Core logic tests for dsh-session-isolate: worktree lifecycle and state
 * ledger on throwaway fixtures. No DSH runtime involved.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  addWorktree, branchDiffStat, branchExists, branchLog, branchWorktree, commitAll, currentBranch,
  deleteBranch, findRepoRoot, hasUncommitted, isRegisteredWorktree, mergeIntoMain, removeWorktree,
} from '../dist/git.js'
import { branchFor, putRecord, recordOf, forgetRecord, worktreePathFor } from '../dist/state.js'

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `iso-${name}-`))
  const repo = join(root, 'main')
  mkdirSync(repo)
  git(repo, 'init', '--quiet', '--initial-branch=main')
  git(repo, 'config', 'user.email', 'iso@test.local')
  git(repo, 'config', 'user.name', 'Iso Test')
  writeFileSync(join(repo, 'README.md'), 'hello\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '--quiet', '-m', 'init')
  return { root, repo }
}

function cleanup({ root }) {
  rmSync(root, { recursive: true, force: true })
}

test('findRepoRoot resolves the main checkout and rejects non-git dirs', async () => {
  const { root, repo } = fixture('root')
  try {
    assert.equal(await findRepoRoot(repo), repo)
    const plain = join(root, 'plain')
    mkdirSync(plain)
    assert.equal(await findRepoRoot(plain), undefined)
  } finally {
    cleanup({ root })
  }
})

test('addWorktree creates a branch and an isolated worktree', async () => {
  const { root, repo } = fixture('wt')
  try {
    const wt = join(root, 'worktree')
    const branch = 'iso/abc12345'
    await addWorktree(repo, wt, branch)
    assert.equal(git(repo, 'branch', '--show-current'), 'main')
    assert.equal(git(wt, 'branch', '--show-current'), branch)
    assert.equal(git(wt, 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'HEAD'))
    assert.equal(await isRegisteredWorktree(repo, wt), true)
    assert.equal(await branchExists(repo, branch), true)
    assert.equal(await branchWorktree(repo, branch), wt.replace(/\\/g, '/'))
  } finally {
    cleanup({ root })
  }
})

test('addWorktree is idempotent for an existing branch/worktree pair', async () => {
  const { root, repo } = fixture('wt2')
  try {
    const wt = join(root, 'worktree')
    await addWorktree(repo, wt, 'iso/def67890')
    await addWorktree(repo, wt, 'iso/def67890') // second call reuses the branch
    assert.equal(git(wt, 'branch', '--show-current'), 'iso/def67890')
  } finally {
    cleanup({ root })
  }
})

test('commitAll commits only inside the worktree; main checkout stays clean', async () => {
  const { root, repo } = fixture('commit')
  try {
    const wt = join(root, 'worktree')
    await addWorktree(repo, wt, 'iso/aaa11111')
    const mainHeadBefore = git(repo, 'rev-parse', 'HEAD')
    writeFileSync(join(wt, 'feature.txt'), 'session work\n')
    assert.equal(await hasUncommitted(wt), true)
    assert.equal(await commitAll(wt, 'turn 1'), true)
    assert.equal(await hasUncommitted(wt), false)
    assert.equal(git(repo, 'rev-parse', 'HEAD'), mainHeadBefore, 'main checkout HEAD must not move')
    assert.equal(git(repo, 'status', '--porcelain'), '', 'main checkout must stay clean')
    assert.match(await branchLog(repo, 'main', 'iso/aaa11111'), /turn 1$/)
    assert.equal(await currentBranch(repo), 'main')
  } finally {
    cleanup({ root })
  }
})

test('commitAll returns false when there is nothing to commit', async () => {
  const { root, repo } = fixture('nop')
  try {
    const wt = join(root, 'worktree')
    await addWorktree(repo, wt, 'iso/bbb22222')
    assert.equal(await commitAll(wt, 'noop'), false)
  } finally {
    cleanup({ root })
  }
})

test('mergeIntoMain brings the session branch into the main checkout', async () => {
  const { root, repo } = fixture('merge')
  try {
    const wt = join(root, 'worktree')
    await addWorktree(repo, wt, 'iso/ccc33333')
    writeFileSync(join(wt, 'feature.txt'), 'session work\n')
    await commitAll(wt, 'turn 1')
    const merged = await mergeIntoMain(repo, 'iso/ccc33333', 'merge session')
    assert.equal(merged.ok, true, merged.stderr)
    assert.ok(existsSync(join(repo, 'feature.txt')), 'feature file must land in the main checkout')
    assert.match(git(repo, 'log', '--oneline', '-1'), /merge session/)
    assert.equal(await branchLog(repo, 'main', 'iso/ccc33333'), '')
    assert.notEqual(await branchDiffStat(repo, 'iso/ccc33333'), undefined)
  } finally {
    cleanup({ root })
  }
})

test('removeWorktree drops the linked worktree but keeps the branch', async () => {
  const { root, repo } = fixture('rm')
  try {
    const wt = join(root, 'worktree')
    await addWorktree(repo, wt, 'iso/ddd44444')
    await removeWorktree(repo, wt)
    assert.equal(existsSync(wt), false)
    assert.equal(await isRegisteredWorktree(repo, wt), false)
    assert.equal(await branchExists(repo, 'iso/ddd44444'), true)
    await deleteBranch(repo, 'iso/ddd44444')
    assert.equal(await branchExists(repo, 'iso/ddd44444'), false)
  } finally {
    cleanup({ root })
  }
})

test('state ledger round-trips records and forgets them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'iso-state-'))
  const oldRoot = process.env.DSH_SESSION_ISOLATE_ROOT
  process.env.DSH_SESSION_ISOLATE_ROOT = root
  try {
    const repo = join(root, 'repo')
    const record = {
      repo,
      worktree: worktreePathFor(repo, 'session-01234567-89ab-cdef-0123-456789abcdef'),
      branch: branchFor('session-01234567-89ab-cdef-0123-456789abcdef'),
      createdAt: new Date().toISOString(),
      linked: ['node_modules'],
    }
    await putRecord('session-01234567-89ab-cdef-0123-456789abcdef', record)
    const read = await recordOf('session-01234567-89ab-cdef-0123-456789abcdef')
    assert.deepEqual(read, record)
    await forgetRecord('session-01234567-89ab-cdef-0123-456789abcdef')
    assert.equal(await recordOf('session-01234567-89ab-cdef-0123-456789abcdef'), undefined)
  } finally {
    if (oldRoot === undefined) delete process.env.DSH_SESSION_ISOLATE_ROOT
    else process.env.DSH_SESSION_ISOLATE_ROOT = oldRoot
    rmSync(root, { recursive: true, force: true })
  }
})
