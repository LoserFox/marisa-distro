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
/** Schemastery schema for the composition entry and the `interpreters` settings namespace. */
export const Config = z.object({
    pythonPath: z.string().default('python').description('Path to the Python interpreter executable.'),
    nodePath: z.string().default('node').description('Path to the Node.js interpreter executable.'),
    timeoutMs: z.number().default(30000).description('Maximum execution time in milliseconds before the process is killed.'),
});
/**
 * Resolve config with fallbacks for missing / invalid values.
 * @param config - raw config from cordis.yml or settings scope.
 * @returns a fully-populated {@link ResolvedConfig}.
 */
export function resolveConfig(config) {
    const pythonPath = typeof config.pythonPath === 'string' && config.pythonPath !== '' ? config.pythonPath : 'python';
    const nodePath = typeof config.nodePath === 'string' && config.nodePath !== '' ? config.nodePath : 'node';
    const timeoutMs = typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : 30000;
    return { pythonPath, nodePath, timeoutMs };
}
