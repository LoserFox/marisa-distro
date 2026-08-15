import { describe, expect, it, vi } from 'vitest'
import { indexedSearch, type PlatformSearchHost } from '../src/platform-search.ts'

function runtime(input: Partial<PlatformSearchHost> & Pick<PlatformSearchHost, 'platform'>): PlatformSearchHost {
  return {
    platform: input.platform,
    home: input.home ?? '/home/test',
    commandExists: input.commandExists ?? (async () => false),
    exec: input.exec ?? (async () => ''),
    windowsDrives: input.windowsDrives ?? (async () => []),
  }
}

describe('indexedSearch', () => {
  it('uses Spotlight metadata queries on macOS', async () => {
    const exec = vi.fn(async () => '/home/test/a.txt\n')
    await expect(indexedSearch('a.txt', runtime({ platform: 'darwin', exec }))).resolves.toEqual(['/home/test/a.txt'])
    expect(exec).toHaveBeenCalledWith('/usr/bin/mdfind', ['kMDItemFSName == "a.txt"c'])
  })

  it('prefers plocate and filters basename matches on Linux', async () => {
    const exec = vi.fn(async () => '/home/test/a.txt\n/home/test/a.txt.bak\n')
    const commandExists = vi.fn(async command => command === 'plocate')
    await expect(indexedSearch('a.txt', runtime({ platform: 'linux', exec, commandExists })))
      .resolves.toEqual(['/home/test/a.txt'])
    expect(exec).toHaveBeenCalledWith('plocate', ['--basename', '--limit', '400', 'a.txt'])
  })

  it('uses Everything CLI on Windows when available', async () => {
    const exec = vi.fn(async () => 'C:\\work\\a.txt\r\n')
    const commandExists = vi.fn(async command => command === 'es.exe')
    await expect(indexedSearch('a.txt', runtime({ platform: 'win32', home: 'C:\\Users\\test', exec, commandExists })))
      .resolves.toEqual(['C:\\work\\a.txt'])
    expect(exec).toHaveBeenCalledWith('es.exe', ['-n', '100', '-whole-filename', 'a.txt'])
  })

  it('falls back to PowerShell on Windows', async () => {
    const exec = vi.fn(async (_command: string, args: readonly string[]) => args.includes('-Command') ? 'D:\\repo\\a.txt\r\n' : '')
    const commandExists = vi.fn(async command => command === 'powershell.exe')
    await expect(indexedSearch('a.txt', runtime({
      platform: 'win32', home: 'C:\\Users\\test', exec, commandExists,
      windowsDrives: async () => ['C:\\', 'D:\\'],
    }))).resolves.toEqual(['D:\\repo\\a.txt'])
    expect(exec).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']))
  })
})
