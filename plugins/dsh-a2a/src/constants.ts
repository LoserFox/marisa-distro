/**
 * A2A protocol constants: the pinned spec version, well-known paths, service
 * parameter headers, JSON-RPC error codes, and the DSH extension URI.
 * @module @dpskh/a2a/constants
 */

/** The A2A protocol version this seam implements (`Major.Minor`, per spec §3.6). */
export const A2A_PROTOCOL_VERSION = '1.0'

/** Well-known path of the public agent card on an agent origin (spec §8.1). */
export const A2A_AGENT_CARD_PATH = '/.well-known/agent-card.json'

/** Service parameter header carrying the client's A2A protocol version (spec §3.2.6). */
export const A2A_VERSION_HEADER = 'A2A-Version'

/** Service parameter header listing extension URIs the client wants to use (spec §3.2.6). */
export const A2A_EXTENSIONS_HEADER = 'A2A-Extensions'

/** The JSON-RPC binding identifier declared in `AgentInterface.protocolBinding`. */
export const A2A_JSONRPC_BINDING = 'JSONRPC'

/**
 * URI identifying the DSH extension namespace. Extension data travels in
 * `metadata[DSH_EXTENSION_URI]` on messages, tasks, and artifacts (spec §4.6.2);
 * it is never `required`, so standard peers can ignore it.
 */
export const DSH_EXTENSION_URI = 'https://deepseek.com/a2a/extensions/dsh/v1'

/** JSON-RPC 2.0 error code: invalid JSON payload (spec §9.5). */
export const JSON_RPC_PARSE_ERROR = -32700

/** JSON-RPC 2.0 error code: request is not a valid Request object (spec §9.5). */
export const JSON_RPC_INVALID_REQUEST = -32600

/** JSON-RPC 2.0 error code: requested method does not exist (spec §9.5). */
export const JSON_RPC_METHOD_NOT_FOUND = -32601

/** JSON-RPC 2.0 error code: method parameters are invalid (spec §9.5). */
export const JSON_RPC_INVALID_PARAMS = -32602

/** JSON-RPC 2.0 error code: internal error (spec §9.5). */
export const JSON_RPC_INTERNAL_ERROR = -32603

/** A2A error code: the task id does not exist or is not accessible (spec §5.4). */
export const A2A_ERROR_TASK_NOT_FOUND = -32001

/** A2A error code: the task is not in a cancelable state (spec §5.4). */
export const A2A_ERROR_TASK_NOT_CANCELABLE = -32002

/** A2A error code: push notifications are not supported (spec §5.4). */
export const A2A_ERROR_PUSH_NOTIFICATION_NOT_SUPPORTED = -32003

/** A2A error code: the requested operation is not supported (spec §5.4). */
export const A2A_ERROR_UNSUPPORTED_OPERATION = -32004

/** A2A error code: a media type in the request is not supported (spec §5.4). */
export const A2A_ERROR_CONTENT_TYPE_NOT_SUPPORTED = -32005

/** A2A error code: the agent returned a non-conforming response (spec §5.4). */
export const A2A_ERROR_INVALID_AGENT_RESPONSE = -32006

/** A2A error code: the agent has no extended agent card configured (spec §5.4). */
export const A2A_ERROR_EXTENDED_AGENT_CARD_NOT_CONFIGURED = -32007

/** A2A error code: a required extension was not declared by the client (spec §5.4). */
export const A2A_ERROR_EXTENSION_SUPPORT_REQUIRED = -32008

/** A2A error code: the requested protocol version is not supported (spec §5.4). */
export const A2A_ERROR_VERSION_NOT_SUPPORTED = -32009
