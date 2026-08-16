import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
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
  }
}

export function missingPrerequisites(layout, { desktop = false } = {}) {
  const required = [
    ['root workspace dependencies', layout.rootModules],
    ['tsdown HMR build dependency', layout.tsdownManifest],
    ['built Harness CLI', layout.cli],
    ['Harness HMR watcher', layout.watcherScript],
    ['generated Marisa profile', layout.profileManifest],
    ['installed Marisa profile dependencies', layout.profileModules],
    ['Marisa desktop overlay', layout.overlay],
  ]
  if (desktop) required.push(['development desktop shell', layout.desktopShell])
  return required.filter(([, target]) => !existsSync(target))
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
        const desktop = spawnService(layout.desktopShell, [], {
          cwd: layout.root,
          env: { ...process.env, DSH_WEB_CMD: buildDesktopBackendCommand(layout) },
        })
        children.push(desktop)
        watch(desktop, 'desktop shell', { normalExit: true })
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
