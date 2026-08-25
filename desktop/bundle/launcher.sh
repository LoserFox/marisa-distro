#!/bin/sh
# marisa-desktop standalone backend launcher for Linux/macOS (bundled inside
# the executable). Mirrors launcher.cmd: runs the bundled node + harness tree
# + marisa profile from the extraction directory. The shell sets DSH_WEB_CMD
# to this file; the web runtime prints the URL line
# ("dsh web: http://127.0.0.1:<port>") which the shell parses from stdout.
# desktop.overlay.yml pins the webserver to an OS-assigned port (0); the
# {port} placeholder the shell substitutes is intentionally unused.
#
# Runs the BUILT CLI (apps/cli/lib/bin.js) - no tsx, no dev toolchain in
# the bundle (the production install is pruned with pnpm install --prod).
#
# MARISA_BOOT_PROFILE (set by the shell in minimal/rescue fallback): which
# profile to boot. Default marisa (full composition); "web" boots the
# harness-shipped template (base + web-app, no marisa plugins).
set -eu

BUNDLE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
DSH_HOME="$BUNDLE/.dsh"
DSH_ROOT="$BUNDLE/marisa-distro"
BOOT_PROFILE="${MARISA_BOOT_PROFILE:-marisa}"
# Plugins may spawn `node`; make the bundled node the first on PATH.
PATH="$BUNDLE:$PATH"
export DSH_HOME DSH_ROOT PATH

cd "$DSH_ROOT/harness"
exec "$BUNDLE/node" "$DSH_ROOT/harness/apps/cli/lib/bin.js" \
  --profile "$BOOT_PROFILE" \
  --patch "$DSH_HOME/profiles/marisa/desktop.overlay.yml" \
  --patch "$DSH_HOME/profiles/marisa/standalone.overlay.yml"
