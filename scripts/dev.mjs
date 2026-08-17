import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const WEB_URL_PATTERN = /\bdsh web: (http:\/\/127\.0\.0\.1:\d+)\b/u

export function parseArgs(argv) {
  const options = { desktop: false, open: true, help: false }
  for (const arg of argv) {
    if (arg === '--desktop') options.desktop = true
    else if (arg === '--no-open') options.open = false
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

export function supportsNativeTypeScript(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 19)
}

export function resolveLayout({
  root = path.resolve(import.meta.dirname, '..'),
  home = homedir(),
  dshHome = process.env.DSH_HOME,
  platform = process.platform,
} = {}) {
  const profileRoot = path.join(dshHome || path.join(home, '.dsh'), 'profiles', 'marisa')
  return {
    root,
    rootModules: path.join(root, 'node_modules'),
    tsdownManifest: path.join(root, 'node_modules', 'tsdown', 'package.json'),
    harness: path.join(root, 'harness'),
    cli: path.join(root, 'harness', 'apps', 'cli', 'lib', 'bin.js'),
    watcherScript: path.join(root, 'harness', 'scripts', 'dev-web.ts'),
    profileManifest: path.join(profileRoot, 'package.json'),
    profileModules: path.join(profileRoot, 'node_modules'),
    overlay: path.join(profileRoot, 'desktop.overlay.yml'),
    desktopShell: path.join(root, 'release', platform === 'win32' ? 'dsh-shell.exe' : 'dsh-shell'),
    desktopDir: path.join(root, 'desktop'),
    // dev 模式日志目录：MARISA_LOG_DIR 覆盖壳的默认缓存日志位置，日志落在
    // 仓库内而非 %LOCALAPPDATA%，便于查看与清理。
    devLogDir: path.join(root, '.dev', 'logs'),
  }
}

export function missingPrerequisites(layout) {
  const required = [
    ['root workspace dependencies', layout.rootModules],
    ['tsdown HMR build dependency', layout.tsdownManifest],
    ['built Harness CLI', layout.cli],
    ['Harness HMR watcher', layout.watcherScript],
    ['generated Marisa profile', layout.profileManifest],
    ['installed Marisa profile dependencies', layout.profileModules],
    ['Marisa desktop overlay', layout.overlay],
  ]
  return required.filter(([, target]) => !existsSync(target))
}

// desktopGoFiles 递归收集 desktop 下的 Go 源文件（排除 _test.go：测试不影响
// 壳产物，改测试无需重建壳）。
export function desktopGoFiles(desktopDir) {
  const sources = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.go') && !entry.name.endsWith('_test.go')) sources.push(full)
    }
  }
  walk(desktopDir)
  return sources
}

// desktopShellBuildCommand 构造 `go build` 重建桌面壳的命令。-C 必须是 go
// 的第一个 flag；-o 必须用绝对路径（相对 -o 会相对 -C 之后的目录解析，
// 产物会落到 desktop/release/ 而非仓库 release/）。
export function desktopShellBuildCommand(layout) {
  return {
    command: 'go',
    args: ['build', '-C', layout.desktopDir, '-o', layout.desktopShell, '.'],
    cwd: layout.root,
  }
}

// needsDesktopShellRebuild 报告壳产物是否缺失或落后于任一 Go 源文件。
export function needsDesktopShellRebuild(layout) {
  let exeMtime = 0
  try {
    exeMtime = statSync(layout.desktopShell).mtimeMs
  } catch {
    return true
  }
  return desktopGoFiles(layout.desktopDir).some((file) => statSync(file).mtimeMs > exeMtime)
}

// rebuildDesktopShell 运行 go build 重建桌面壳；失败抛出带编译输出的错误。
// go 不在 PATH 时给出可操作的指引。
export function rebuildDesktopShell(layout) {
  const { command, args, cwd } = desktopShellBuildCommand(layout)
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `Go 工具链未找到（${command} 不在 PATH）：无法自动重建桌面壳。请安装 Go，或先运行 \`pnpm build\`。`,
    )
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.status !== 0) {
    throw new Error(`desktop shell build failed (exit ${String(result.status)}):\n${output}`)
  }
  return output
}

export function buildBackendArgs(layout, { port = '0' } = {}) {
  return [
    layout.cli,
    'web',
    '--profile', 'marisa',
    '--patch', layout.overlay,
    '--dev',
    '--port', port,
  ]
}

export function buildWatcherArgs(layout) {
  return [layout.watcherScript, '--poll']
}

function quoteCommandArgument(value) {
  if (value.includes('"')) throw new Error(`development command path contains an unsupported quote: ${value}`)
  return `"${value}"`
}

export function buildDesktopBackendCommand(layout, nodeExecutable = process.execPath) {
  return [nodeExecutable, ...buildBackendArgs(layout, { port: '{port}' })]
    .map(quoteCommandArgument)
    .join(' ')
}

export function extractWebUrl(line) {
  return WEB_URL_PATTERN.exec(line)?.[1]
}

function printHelp() {
  console.log(`Usage: pnpm dev [--no-open]
       pnpm dev:desktop

Starts the Marisa development backend and Harness client-plugin HMR watcher.
Run pnpm build once before the first development session.`)
}

function spawnService(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
}

function relayStream(stream, destination, onChunk) {
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    destination.write(chunk)
    onChunk?.(chunk)
  })
}

function waitForWatcherReady(watcher) {
  return new Promise((resolve, reject) => {
    let outputTail = ''
    let timeout
    const onData = (chunk) => {
      outputTail = `${outputTail}${chunk}`.slice(-4096)
      if (outputTail.includes('dev-web: watching ')) finish()
    }
    const onError = error => finish(new Error(`HMR watcher failed to start: ${error.message}`))
    const onExit = (code, signal) => finish(new Error(`HMR watcher exited before it was ready (${signal ?? `code ${String(code)}`})`))
    const finish = (error) => {
      clearTimeout(timeout)
      watcher.stdout.removeListener('data', onData)
      watcher.stderr.removeListener('data', onData)
      watcher.removeListener('error', onError)
      watcher.removeListener('exit', onExit)
      if (error) reject(error)
      else resolve()
    }
    timeout = setTimeout(() => finish(new Error('HMR watcher did not finish its initial build within 180 seconds')), 180_000)
    watcher.stdout.on('data', onData)
    watcher.stderr.on('data', onData)
    watcher.once('error', onError)
    watcher.once('exit', onExit)
  })
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', error => console.warn(`[dev] could not open browser: ${error.message}`))
  child.unref()
}

async function stopProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', resolve)
      killer.once('exit', resolve)
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

export async function runDev(options, layout = resolveLayout()) {
  if (!supportsNativeTypeScript()) {
    throw new Error(`Node ${process.versions.node} is unsupported; development requires Node 22.19+ or 24+`)
  }
  const missing = missingPrerequisites(layout, options)
  if (missing.length > 0) {
    const detail = missing.map(([label, target]) => `  - ${label}: ${target}`).join('\n')
    throw new Error(`development prerequisites are missing:\n${detail}\nRun \`pnpm build\` once, then retry.`)
  }

  const watcher = spawnService(process.execPath, buildWatcherArgs(layout), {
    cwd: layout.harness,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const children = [watcher]
  let stopping = false

  const stopAll = async () => {
    if (stopping) return
    stopping = true
    await Promise.allSettled(children.map(stopProcessTree))
  }

  const onSignal = (signal) => {
    console.log(`\n[dev] received ${signal}; stopping development services...`)
    void stopAll().finally(() => process.exit(0))
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    relayStream(watcher.stdout, process.stdout)
    relayStream(watcher.stderr, process.stderr)
    console.log('[dev] building Harness client plugins before backend startup...')
    await waitForWatcherReady(watcher)

    const completion = new Promise((resolve, reject) => {
      const watch = (child, name, { normalExit = false } = {}) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          reject(new Error(`${name} exited unexpectedly (${child.signalCode ?? `code ${String(child.exitCode)}`})`))
          return
        }
        child.once('error', error => reject(new Error(`${name} failed to start: ${error.message}`)))
        child.once('exit', (code, signal) => {
          if (stopping) return
          if (normalExit && code === 0) resolve(0)
          else reject(new Error(`${name} exited unexpectedly (${signal ?? `code ${String(code)}`})`))
        })
      }
      watch(watcher, 'HMR watcher')

      if (options.desktop) {
        // 壳产物缺失或落后于 Go 源码时自动重建（webui 路径不涉及）。
        if (needsDesktopShellRebuild(layout)) {
          console.log('[dev] rebuilding desktop shell (Go sources changed)...')
          const output = rebuildDesktopShell(layout)
          if (output) console.log(output)
        }
        const desktop = spawnService(layout.desktopShell, [], {
          cwd: layout.root,
          // GUI 子系统进程双击启动时无可用 stderr；显式 pipe 并转发，
          // 保证 dev 模式下壳日志与后端日志都出现在终端。
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            DSH_WEB_CMD: buildDesktopBackendCommand(layout),
            MARISA_LOG_DIR: layout.devLogDir,
          },
        })
        children.push(desktop)
        watch(desktop, 'desktop shell', { normalExit: true })
        relayStream(desktop.stdout, process.stdout)
        relayStream(desktop.stderr, process.stderr)
        console.log(`[dev] desktop logs: ${layout.devLogDir}`)
        console.log('[dev] DevTools: 托盘菜单「打开 DevTools」；MARISA_DEVTOOLS=1 启动即开')
        console.log('[dev] desktop development shell started; Ctrl+C stops it and the HMR watcher')
        return
      }

      const backend = spawnService(process.execPath, buildBackendArgs(layout), {
        cwd: layout.harness,
        stdio: ['inherit', 'pipe', 'pipe'],
      })
      children.push(backend)
      watch(backend, 'web backend')
      let opened = false
      let backendOutputTail = ''
      const maybeOpenBrowser = (chunk) => {
        if (!opened && options.open) {
          backendOutputTail = `${backendOutputTail}${chunk}`.slice(-4096)
          const url = extractWebUrl(backendOutputTail)
          if (url) {
            opened = true
            console.log(`[dev] opening ${url}`)
            openBrowser(url)
          }
        }
      }
      relayStream(backend.stdout, process.stdout, maybeOpenBrowser)
      relayStream(backend.stderr, process.stderr, maybeOpenBrowser)
    })
    return await completion
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    await stopAll()
  }
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) printHelp()
    else process.exitCode = await runDev(options)
  } catch (error) {
    console.error(`[dev] ${error.message}`)
    process.exitCode = 1
  }
}
