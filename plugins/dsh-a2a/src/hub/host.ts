/**
 * The hub host service: opens the a2a storage domain, exposes the project
 * registry and message store, and — when configured — listens as the mesh
 * hub (HTTP + realtime WebSocket). The domain needs a routed storage
 * backend from the composition (the deployment decides the medium); a
 * missing storage form fails the service init loud.
 * @module @dpskh/a2a/hub/host
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { A2aHubMessages } from './messages.ts'
import { A2aHubRegistry } from './registry.ts'
import { A2aHubServer } from './server.ts'
import { a2aHubDomainSpec } from './spec.ts'

/** Hub host configuration. */
export interface A2aHubHostConfig {
  /** Bind host of the mesh hub; defaults to `127.0.0.1`. */
  readonly host?: string
  /** Bind port; `0` asks the OS for an ephemeral port. */
  readonly port: number
  /** Inclusive upper port bound; `EADDRINUSE` walks up to it before failing. */
  readonly maxPort?: number
}

/**
 * The mesh hub host (`ctx.a2aHub`): one open a2a domain with the project
 * registry, the message store, and an optional listening hub server (HTTP
 * routes plus the realtime WebSocket). Everything rides the service
 * fiber's effect: the domain closes and the server stops with the fiber
 * (HMR-safe).
 */
export class A2aHubHostService extends Service {
  static inject = ['storageDomain']

  private readonly serverConfig: A2aHubHostConfig | undefined
  private readonly bindHost: string
  private registry: A2aHubRegistry | undefined
  private messages: A2aHubMessages | undefined
  private server: A2aHubServer | undefined

  /**
   * @param ctx - Cordis context with a mounted storage-domain facility.
   * @param config - hub bind configuration; omit to run registry/messages
   * without a listening server (pure client deployments).
   */
  constructor(ctx: Context, config?: A2aHubHostConfig) {
    super(ctx, 'a2aHub')
    this.serverConfig = config
    this.bindHost = config?.host ?? '127.0.0.1'
    this.ctx.effect(async () => {
      let domain: Awaited<ReturnType<typeof this.openDomain>>
      try {
        domain = await this.openDomain()
      } catch (error) {
        // Cordis logs async-effect startup failures without failing the
        // composition, which would leave the mesh silently hub-less; make
        // the refusal loud and actionable here (a version-mismatched
        // medium, an unmounted storage backend, …).
        this.ctx.logger.error(`a2aHub: failed to open the a2a storage domain: ${String(error)}`)
        throw error
      }
      this.registry = new A2aHubRegistry(domain)
      this.messages = new A2aHubMessages(domain)
      const serverConfig = this.serverConfig
      if (serverConfig !== undefined) {
        const server = new A2aHubServer({
          host: this.bindHost,
          port: serverConfig.port,
          ...(serverConfig.maxPort === undefined ? {} : { maxPort: serverConfig.maxPort }),
          registry: this.registry,
          messages: this.messages,
        })
        await server.listen()
        this.server = server
      }
      return async () => {
        if (this.server !== undefined) await this.server.close()
        await domain.close()
      }
    }, 'a2aHub.lifetime')
  }

  /** The project registry. */
  get registryService(): A2aHubRegistry {
    const registry = this.registry
    /* v8 ignore next 2 -- defensive: the lifetime effect assigns before any external call */
    if (registry === undefined) {
      throw new Error('a2aHub registry is not ready (service fiber did not activate)')
    }
    return registry
  }

  /** The message store. */
  get messagesService(): A2aHubMessages {
    const messages = this.messages
    /* v8 ignore next 2 -- defensive: the lifetime effect assigns before any external call */
    if (messages === undefined) {
      throw new Error('a2aHub messages are not ready (service fiber did not activate)')
    }
    return messages
  }

  /**
   * The bound hub port once listening.
   * @returns the port, or `undefined` before start or without a server.
   */
  get port(): number | undefined {
    return this.server?.port
  }

  /**
   * The hub's base URL once listening — the address in-process mesh clients
   * follow when they do not configure their own `hubUrl`.
   * @returns `http://<bindHost>:<port>`, or `undefined` before start or
   * without a server.
   */
  get url(): string | undefined {
    return this.server?.url
  }

  /** Open the a2a storage domain. */
  private async openDomain() {
    return this.ctx.storageDomain.open(a2aHubDomainSpec)
  }
}
