# dsh-external compatibility fixtures

The files under this directory are verbatim copies of third-party plugin
sources pinned for the #22 ecosystem-compatibility matrix
(`docs/plugin-ecosystem-compat.md`). They are test fixtures, not harness
code: each source was copied unchanged from its `dsh-external` repository at
the commit below and is exercised only through the manager's migration
bridge (`fromCordisPlugin`) or a documented wrapper.

| Fixture | Upstream repository | Pinned commit | License |
|---|---|---|---|
| `chat-width/index.mjs` | `dsh-external/chat-width` | `9ab48d6a29b947a2aa44e9bc50daf37aea134a3f` | BSD-3-Clause (see `chat-width/LICENSE`) |
| `working-activity/src/*` | `dsh-external/dsh-working-activity` (`packages/activity/working-activity/`) | `aa00794b529fa08e3b4e9ca459ac58b144a67d31` | MIT (see `working-activity/LICENSE`) |
| `session-chatlog/src/*` | `dsh-external/session-chatlog` | `5c2a344ab1327f9edd2d5172ae0cee55661dbe7a` | BSD-3-Clause (package.json) |
| `dsh-tool-calculator/src/*` | `dsh-external/dsh-tool-calculator` | `fa79a1f53a1ba640a0444d01bdd4635088fa4b6d` | MIT (see `dsh-tool-calculator/LICENSE`) |
| `distill/src/index.ts` | `dsh-external/distill` | `75a7615e50535b4216b410bda4a7fcd33ba30d07` | BSD-3-Clause (package.json; prompt adapted from Nous Research hermes-agent, MIT) |

Re-syncing: replace the files with new clones at the new commits, update this
table, and re-run `packages/cordis/mygo/tests/ecosystem-compat.spec.ts`.
The compatibility verdicts in the matrix document are tied to these commits.
