import { describe, expect, it } from 'vitest'
import { detectPathPlatform, pathsFromDrop, pathsFromUriList } from '../src/client/paths.ts'

describe('detectPathPlatform', () => {
  it('detects Windows and defaults other desktop platforms to POSIX', () => {
    expect(detectPathPlatform({ platform: 'Win32' } as Navigator)).toBe('windows')
    expect(detectPathPlatform({ platform: 'MacIntel' } as Navigator)).toBe('posix')
    expect(detectPathPlatform({ platform: 'Linux x86_64' } as Navigator)).toBe('posix')
  })
})

describe('pathsFromUriList', () => {
  it('decodes macOS and Linux file URLs and removes duplicates', () => {
    expect(pathsFromUriList([
      '# file-manager comment',
      'file:///home/test/My%20File.txt',
      'file:///home/test/My%20File.txt',
      'file://localhost/home/test/%E6%96%87%E4%BB%B6.txt',
      'https://example.com/file.txt',
    ].join('\n'), 'posix')).toEqual([
      '/home/test/My File.txt',
      '/home/test/文件.txt',
    ])
  })

  it('converts Windows drive and UNC file URLs to native paths', () => {
    expect(pathsFromUriList([
      'file:///C:/Profiles/test/My%20File.txt',
      'file://server/share/folder/report.txt',
    ].join('\r\n'), 'windows')).toEqual([
      'C:\\Profiles\\test\\My File.txt',
      '\\\\server\\share\\folder\\report.txt',
    ])
  })

  it('rejects remote shares on POSIX and drive-less local URLs on Windows', () => {
    expect(pathsFromUriList('file://server/share/a\nfile:///tmp/a', 'windows')).toEqual([
      '\\\\server\\share\\a',
    ])
    expect(pathsFromUriList('file://server/share/a\nfile:///tmp/a', 'posix')).toEqual(['/tmp/a'])
  })

  it('ignores malformed, root and non-file entries', () => {
    expect(pathsFromUriList('not a url\nfile://\nfile:///\nfile:///tmp/a', 'posix')).toEqual(['/tmp/a'])
  })
})

describe('pathsFromDrop', () => {
  it('prefers uri-list and falls back to plain text', () => {
    const reads: string[] = []
    const dataTransfer = {
      types: ['Files', 'text/uri-list'],
      getData(type: string) {
        reads.push(type)
        return type === 'text/uri-list' ? 'file:///tmp/one' : 'file:///tmp/two'
      },
    }
    expect(pathsFromDrop(dataTransfer, 'posix')).toEqual(['/tmp/one'])
    expect(reads).toEqual(['text/uri-list'])
  })

  it('uses plain text when uri-list is empty', () => {
    expect(pathsFromDrop({
      types: ['Files'],
      getData: () => 'file:///D:/work/two.txt',
    }, 'windows')).toEqual(['D:\\work\\two.txt'])
  })
})
