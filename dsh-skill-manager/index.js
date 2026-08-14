/**
 * dsh-skill-manager — host-plane plugin that manages user skills.
 *
 * This is a Consumer of the skill capability: it reads and writes the user
 * skill directory (`<dshHome>/skills`, default `~/.dsh/skills`) that
 * `@deepseek-ai/dsh-skill-filesystem` already discovers and watches. It
 * exposes management through two surfaces:
 *
 *   - the `skill_manage` model tool (list / get / save / remove), and
 *   - the `/skills` and `/skill-remove` slash commands.
 *
 * Nothing here enters model history unless the model calls the tool; slash
 * command output is rendered by the UI command plane. After a save or remove,
 * the filesystem provider picks the change up on its next discovery, so the
 * `/` composer menu and the model skill catalog follow without further work.
 *
 * The only runtime dependency is `yaml`: the tool definition is constructed
 * by hand (raw JSON Schema) instead of importing `@deepseek-ai/dsh-tools`, so
 * a pnpm install needs no harness peer packages. Plain ESM, no build step.
 *
 * @module dsh-skill-manager
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/** Stable Cordis plugin name. */
export const name = 'skill-manager'

/** Required services: the command registry and the tool registry. */
export const inject = ['commands', 'tools']

/** Kebab-case skill name grammar shared with the skill registry. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Resolve the harness home: config override > $DSH_HOME > ~/.dsh. */
function resolveHome(config = {}) {
  const fromEnv = process.env.DSH_HOME
  return config.dshHome ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh'))
}

/** The user skills directory under a harness home. */
function skillsRoot(home) {
  return join(home, 'skills')
}

function isAbsentError(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

/** Lenient YAML boolean read matching the filesystem provider's spellings. */
function boolField(data, key) {
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
    }
  }
  return undefined
}

/** Split `---`-delimited YAML frontmatter from the Markdown body. */
function parseFrontmatter(raw) {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, '')
  if (firstLine !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === '---') {
      const yaml = raw.slice(start, lineStart)
      let data
      try {
        data = parseYaml(yaml)
      } catch {
        return undefined
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
      return { data, body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1) }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

/** Parse one SKILL.md text into a validated user skill. */
function parseSkill(raw, path) {
  const frontmatter = parseFrontmatter(raw)
  if (frontmatter === undefined) return undefined
  const skillName = typeof frontmatter.data.name === 'string' && frontmatter.data.name.length > 0 ? frontmatter.data.name : undefined
  const description = typeof frontmatter.data.description === 'string' && frontmatter.data.description.length > 0 ? frontmatter.data.description : undefined
  if (skillName === undefined || description === undefined) return undefined
  if (!SKILL_NAME.test(skillName)) return undefined
  const whenToUse = typeof frontmatter.data.whenToUse === 'string' && frontmatter.data.whenToUse.length > 0 ? frontmatter.data.whenToUse : undefined
  return {
    name: skillName,
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    modelInvocable: boolField(frontmatter.data, 'disable-model-invocation') !== true,
    userInvocable: boolField(frontmatter.data, 'user-invocable') !== false,
    content: frontmatter.body.trim(),
    path,
  }
}

/** Render one save input as the canonical SKILL.md text. */
function renderSkill(input) {
  const frontmatter = {
    name: input.name,
    description: input.description,
  }
  if (input.whenToUse !== undefined && input.whenToUse.trim().length > 0) frontmatter.whenToUse = input.whenToUse
  // The provider defaults both surfaces to permitted, so write the restrictive
  // half only when a surface is turned off.
  if (!input.modelInvocable) frontmatter['disable-model-invocation'] = true
  if (!input.userInvocable) frontmatter['user-invocable'] = false
  return `---\n${stringifyYaml(frontmatter)}---\n\n${input.content.trim()}\n`
}

/** List every readable user skill, sorted by name. */
async function listUserSkills(home) {
  const root = skillsRoot(home)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' })
  } catch (error) {
    if (isAbsentError(error)) return []
    throw error
  }
  const skills = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '.system') continue
    const path = entry.isDirectory()
      ? join(root, entry.name, 'SKILL.md')
      : entry.isFile() && entry.name.endsWith('.md')
        ? join(root, entry.name)
        : undefined
    if (path === undefined) continue
    let raw
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if (isAbsentError(error)) continue
      throw error
    }
    const parsed = parseSkill(raw, path)
    if (parsed !== undefined) skills.push(parsed)
  }
  return skills.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
}

/** Read one user skill by name (directory bundle or flat Markdown file). */
async function readUserSkill(home, skillName) {
  if (typeof skillName !== 'string' || !SKILL_NAME.test(skillName)) return undefined
  const root = skillsRoot(home)
  for (const path of [join(root, skillName, 'SKILL.md'), join(root, `${skillName}.md`)]) {
    let raw
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if (isAbsentError(error)) continue
      throw error
    }
    const parsed = parseSkill(raw, path)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

/** Create or update one user skill as a `<name>/SKILL.md` bundle. */
async function writeUserSkill(home, input) {
  const root = skillsRoot(home)
  if (input.originalName !== undefined && input.originalName !== input.name) {
    await removeUserSkill(home, input.originalName)
  }
  const directory = join(root, input.name)
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'SKILL.md')
  await writeFile(path, renderSkill(input), 'utf8')
  return { name: input.name, path }
}

/** Delete one user skill (directory bundle and flat file). */
async function removeUserSkill(home, skillName) {
  if (typeof skillName !== 'string' || !SKILL_NAME.test(skillName)) return
  const root = skillsRoot(home)
  let removed = false
  for (const target of [join(root, skillName), join(root, `${skillName}.md`)]) {
    try {
      await rm(target, { recursive: true, force: true })
      removed = true
    } catch (error) {
      if (!isAbsentError(error)) throw error
    }
  }
  if (!removed) throw new Error(`skill "${skillName}" does not exist under ${root}`)
}

/** Validate a save input against the same requirements the registry enforces. */
function validateSave(input) {
  if (typeof input.name !== 'string' || !SKILL_NAME.test(input.name)) {
    throw new Error(`invalid skill name "${input.name}"`)
  }
  if (typeof input.description !== 'string' || input.description.trim().length === 0) {
    throw new Error(`skill "${input.name}" requires a description`)
  }
  if (typeof input.content !== 'string' || input.content.trim().length === 0) {
    throw new Error(`skill "${input.name}" requires instruction content`)
  }
}

/** Render one skill summary as a compact list line. */
function summaryLine(skill) {
  return `- ${skill.name}: ${skill.description} (model=${skill.modelInvocable}, user=${skill.userInvocable})`
}

/** Model-facing JSON Schema for the `skill_manage` tool arguments. */
const SKILL_MANAGE_PARAMETERS = {
  type: 'object',
  properties: {
    action: { type: 'string', description: 'One of: list, get, save, remove' },
    name: { type: 'string', description: 'kebab-case skill name (required for get, save, remove)' },
    originalName: { type: 'string', description: 'previous name when renaming an existing skill' },
    description: { type: 'string', description: 'short routing description (required for save)' },
    whenToUse: { type: 'string', description: 'optional extra routing guidance' },
    content: { type: 'string', description: 'markdown instruction body (required for save)' },
    modelInvocable: { type: 'boolean', description: 'whether the model may load this skill; defaults to true' },
    userInvocable: { type: 'boolean', description: 'whether /name may invoke this skill; defaults to true' },
  },
  required: ['action'],
}

/**
 * Register the management surfaces on the current fiber. Every registration
 * is reversible, so stop / update / remove undo it automatically.
 * @param ctx - plugin context carrying the `commands` and `tools` services.
 * @param config - raw row config; `dshHome` overrides the harness home.
 */
export function apply(ctx, config = {}) {
  const home = resolveHome(config)

  // Slash command: list the user skills.
  ctx.commands.register({
    name: 'skills',
    description: 'List your user skills (~/.dsh/skills)',
    handler: async () => {
      try {
        const skills = await listUserSkills(home)
        if (skills.length === 0) {
          return { kind: 'success', text: 'No user skills yet. Create one with the skill_manage tool.' }
        }
        return { kind: 'success', text: `User skills:\n${skills.map(summaryLine).join('\n')}` }
      } catch (error) {
        return { kind: 'error', text: `skills: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  })

  // Slash command: remove one user skill by name.
  ctx.commands.register({
    name: 'skill-remove',
    description: 'Remove a user skill by name',
    input: { hint: '<name>' },
    handler: async ({ rawInput }) => {
      const skillName = rawInput.trim()
      if (!SKILL_NAME.test(skillName)) {
        return { kind: 'error', text: `invalid skill name "${skillName}"` }
      }
      try {
        await removeUserSkill(home, skillName)
        return { kind: 'success', text: `Removed skill "${skillName}".` }
      } catch (error) {
        return { kind: 'error', text: `skill-remove: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  })

  // Model tool: full CRUD over user skills.
  ctx.tools.register({
    name: 'skill_manage',
    description: 'Manage user skills stored in ~/.dsh/skills. Use action "list" to see them, "get" to read one, "save" to create or update one (pass name, description, content, and optionally whenToUse/modelInvocable/userInvocable; originalName renames), and "remove" to delete one. Skills written here become available through the existing /name command and skill tool.',
    parameters: SKILL_MANAGE_PARAMETERS,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      switch (args.action) {
        case 'list': {
          const skills = await listUserSkills(home)
          if (skills.length === 0) return `No user skills under ${skillsRoot(home)}.`
          return `User skills:\n${skills.map(summaryLine).join('\n')}`
        }
        case 'get': {
          const skill = await readUserSkill(home, args.name)
          if (skill === undefined) return `skill "${args.name}" not found under ${skillsRoot(home)}.`
          return `# ${skill.name}\n${skill.description}\n\n${skill.content}`
        }
        case 'save': {
          validateSave(args)
          const written = await writeUserSkill(home, {
            ...(args.originalName === undefined ? {} : { originalName: args.originalName }),
            name: args.name,
            description: args.description,
            ...(args.whenToUse === undefined ? {} : { whenToUse: args.whenToUse }),
            content: args.content,
            modelInvocable: args.modelInvocable !== false,
            userInvocable: args.userInvocable !== false,
          })
          return `Saved skill "${written.name}" -> ${written.path}`
        }
        case 'remove': {
          await removeUserSkill(home, args.name)
          return `Removed skill "${args.name}".`
        }
        default:
          throw new Error(`unknown action "${args.action}"`)
      }
    },
  })
}
