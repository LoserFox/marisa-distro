/**
 * config.ts — composition-layer schema, resolved config shape, and resolver.
 *
 * The composition `Config` (cordis.patch.yml) is the first-boot seed; the
 * settings user layer composes on top of it at runtime. `resolveConfig`
 * normalises any combination of partial source values (composition, user
 * layer, or both) into a fully-populated {@link ResolvedConfig} the tool
 * registration and gateway can consume.
 *
 * @module dsh-interpreters/config
 */
import z from 'schemastery';
/** Composition + user-layer config shape (all fields optional at the boundary). */
export interface Config {
    pythonPath?: string;
    nodePath?: string;
    timeoutMs?: number;
}
/** Fully-resolved config with fallbacks applied; what the tools and gateway serve. */
export interface ResolvedConfig {
    pythonPath: string;
    nodePath: string;
    timeoutMs: number;
}
/** Schemastery schema for the composition entry and the `interpreters` settings namespace. */
export declare const Config: z<Config>;
/**
 * Resolve config with fallbacks for missing / invalid values.
 * @param config - raw config from cordis.yml or settings scope.
 * @returns a fully-populated {@link ResolvedConfig}.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
