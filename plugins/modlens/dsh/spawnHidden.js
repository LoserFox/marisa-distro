// The only place this plugin starts a child process.
//
// The desktop app has no console of its own, so on Windows every child it
// starts would be given one and shown its window: a black box per read
// (issue #60). `windowsHide` suppresses that, defaults to false in Node, and is
// ignored elsewhere.
//
// It lives in a file of its own, apart from its callers, so the rule can be
// checked by looking at which files reach `child_process` at all rather than at
// what each call passes. A call site cannot forget an option it never writes,
// and writing the option after the caller's leaves nothing to override it.
//
// The core has its own copy in src/util/spawnHidden.ts. The duplication is on
// purpose: this plugin ships as a unit and must not import from the CLI it
// drives.
import { spawn } from 'node:child_process'

export function spawnHidden(command, args, options) {
  return spawn(command, args, { ...options, windowsHide: true })
}
