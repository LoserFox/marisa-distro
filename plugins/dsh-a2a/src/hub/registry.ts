/**
 * Project registry over the a2a hub domain: metadata plus the per-project
 * sequence counter seeded at creation. Presence and roster state are
 * in-memory (see presence.ts); the registry owns only what survives a hub
 * restart alongside the message history.
 * @module @dpskh/a2a/hub/registry
 */

import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { A2aError } from '../error.ts'
import { PROJECT_NAME_RE } from './message-ref.ts'
import type { a2aHubDomainSpec, a2aProjectRecord } from './spec.ts'
import type { A2aProject } from './types.ts'

/** Registry errors with stable codes. */
export class RegistryError extends A2aError {
  /** @param message - human-readable failure. */
  constructor(message: string) {
    super(message, 'A2A_REGISTRY')
  }
}

/** The project already exists (create conflict). */
export class ProjectConflictError extends RegistryError {}

/** The project does not exist (create it first). */
export class UnknownProjectError extends RegistryError {}

type HubDomain = Domain<typeof a2aHubDomainSpec>

/** The project registry over one opened a2a domain. */
export class A2aHubRegistry {
  /** @param domain - the opened a2a hub domain. */
  constructor(private readonly domain: HubDomain) {}

  /**
   * Create one project and seed its sequence counter.
   * @param name - project name.
   * @param meta - display name, description, and creating cwd.
   * @returns the created project.
   * @throws {ProjectConflictError} when the project already exists.
   */
  async createProject(name: string, meta: { displayName?: string; description?: string; createdByCwd?: string } = {}): Promise<A2aProject> {
    this.assertName(name)
    const projects = this.domain.table('projects')
    if (projects.get(name) !== undefined) {
      throw new ProjectConflictError(`project already exists: ${name}`)
    }
    const createdAt = Date.now()
    const record = {
      ...(meta.displayName === undefined ? {} : { displayName: meta.displayName }),
      ...(meta.description === undefined ? {} : { description: meta.description }),
      ...(meta.createdByCwd === undefined ? {} : { createdByCwd: meta.createdByCwd }),
      createdAt,
    }
    await projects.put(name, record)
    await this.domain.table('sequences').put(name, { next: 1 })
    return { name, ...record }
  }

  /**
   * Delete one project's metadata and sequence counter (the message
   * history is purged by the message store in the same route).
   * @param name - project name.
   * @returns true when the project existed.
   */
  async deleteProject(name: string): Promise<boolean> {
    this.assertName(name)
    const projects = this.domain.table('projects')
    if (projects.get(name) === undefined) return false
    await projects.delete(name)
    await this.domain.table('sequences').delete(name)
    return true
  }

  /**
   * Read one project (synchronous; the realtime claim path uses it).
   * @param name - project name.
   * @returns the project, or `null` when unknown.
   */
  getProject(name: string): A2aProject | null {
    this.assertName(name)
    const record = this.domain.table('projects').get(name)
    return record === undefined ? null : this.projectView(name, record)
  }

  /**
   * List projects.
   * @returns projects sorted by name.
   */
  listProjects(): A2aProject[] {
    return [...this.domain.table('projects').entries()]
      .map(([name, record]) => this.projectView(name, record))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  /** Assert one project name against the shared rule. */
  private assertName(name: string): void {
    if (!PROJECT_NAME_RE.test(name)) {
      throw new Error(`invalid project name "${name}" (use [a-zA-Z0-9._-], start alnum, max 64)`)
    }
  }

  /** Project one stored row into its wire view. */
  private projectView(name: string, record: z.infer<typeof a2aProjectRecord>): A2aProject {
    return {
      name,
      ...(record.displayName === undefined ? {} : { displayName: record.displayName }),
      ...(record.description === undefined ? {} : { description: record.description }),
      ...(record.createdByCwd === undefined ? {} : { createdByCwd: record.createdByCwd }),
      createdAt: record.createdAt,
    }
  }
}
