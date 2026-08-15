# Agent Note: Client Tool presentation ownership

Status: implemented

English | [中文](2026-08-08-client-tool-presentation-ownership.zh.md)

## Problem

The Client Runtime already projects Tool calls into a stable lifecycle: it pairs call/result events by `callId`, preserves running and settled forms, and indexes Code Dispatch children by their root call. The chat view nevertheless owned the entire presentation stack. It placed root calls in ChatFlow, composed each root with its subcalls, dispatched every atomic call by Tool name, carried the generic fallback and card models, registered first-party Tool views, and reused those models in the details panel.

That ownership made `ui-conversation` interpret business Tool names and made subcalls an orphaned concern if an atomic Tool view moved elsewhere. A business package such as `ui-skill` could register a row, but it still depended on conversation's Tool-specific composition contract. Adding Tool-specific Session projection would duplicate a data model the Runtime already owns, while moving only individual React components would leave the composition and model coupling in place.

## Decision

Tool is a first-class Client UI concept with one presentation owner, `@deepseek-ai/dsh-client-ui-tool`. Runtime normalizes Code Dispatch into recursive `ToolCallBlock` values: every root or child owns its next level through `subCalls`, and `ConversationSnapshot` exposes no separate parent-to-children map.

“First-class concept” describes UI ownership only; it adds no Runtime data kind. `ConversationNode` remains the transcript projection, `ChatFlowItem` remains the render unit produced when conversation sorts and groups nodes, `ToolCallBlock` remains the standard data for one call, and `ToolCallTree` only composes root/subcall presentation within Tool. Command continues to render through the separate `'conversation.chat.commandview'` seat and does not become Tool.

`ui-conversation` owns ordered placement. `deriveChatFlow()` still decides where a settled Tool group appears, and `ChatView` still appends running calls, maintains scroll anchors and selection, and supplies host actions. For each root call it renders the single/session `'conversation.chat.tool'` seat with the root block, selected call id, session cwd, and open-file/inspect callbacks. It does not read Code Dispatch children, branch on Tool names, or import Tool-specific views and card models.

`ui-tool` occupies that whole-Tool seat. `ToolCallTree` recursively walks the root block's `subCalls` and routes every level through one keyed/session `'tool.call.toolview'` child slot using `entryKey: toolName`. An absent business registration renders `GenericToolCard`. It neither reads Session nor maintains a second call topology.

Business plugins register only atomic views against `'tool.call.toolview'`. Their owner payload is the standard Tool call block plus identity, cwd, and host actions; it carries no Session projector or conversation service. Skill remains an ordinary Tool and `ui-skill` registers the `skill` key through this seam. Existing first-party views live in `ui-tool` until a business package has a reason to own one independently.

The details panel is a second Tool presentation site but not a call-tree owner. `ui-conversation` delegates its selected output body through the single/session `'conversation.details.tool'` seat; `ui-tool` renders the card-aware output and the seat fallback preserves raw result text when the plugin is absent. Card models therefore have one production owner without introducing a reverse implementation import.

The Runtime remains the authority for Tool lifecycle and call topology. Code Dispatch is an official top-level concept because it changes parent/child identity; a private `ToolCallTree` shares one fold between live and history paths and projects its index into standard recursive call blocks. Ordinary Tool business differences stay at the keyed presentation seam, and this package boundary adds no Tool projector/fold registry.

## Runtime and render path

This boundary starts at the Client's `ConversationSnapshot`; the full render path is:

```text
ConversationSnapshot.nodes
  -> deriveChatFlow()
  -> settled tool-group positions ----+
                                      |
ConversationSnapshot.runningCalls     |
  -> ChatView flow tail ---------------+-> ToolSeat
                                           -> conversation.chat.tool
                                           -> ToolCallTree
                                                -> root ToolCallBlock
                                                     `- subCalls[] (recursive)
                                                          -> tool.call.toolview(entryKey = toolName)
                                                               |- registered atomic view
                                                               `- GenericToolCard fallback
```

Runtime's [`ToolCallTree`](../../../../packages/client/runtime/src/client/sessions/tool-call-tree.ts) privately indexes child lifecycles by parent callId and is shared by the live [`Session.buildSnapshot()`](../../../../packages/client/runtime/src/client/sessions/session.ts) and historical [`projectConversationHistory()`](../../../../packages/client/runtime/src/client/session-history/history-fold.ts) paths. It recursively projects children onto root `ToolCallBlock` values and copies only the owning ancestor path when a child changes. Unchanged siblings, other roots, and snapshot references with no Tool-topology change stay stable so React selectors and memoization can skip unrelated updates. Tool UI consumes this unified tree without repeating call/result pairing, historical replay, or cache indexing.

[`ChatView`](../../../../packages/client/ui-conversation/src/client/chat/ChatView.tsx) reruns [`deriveChatFlow()`](../../../../packages/client/ui-conversation/src/client/chat/chat-flow.ts) only when the `nodes` reference changes. It groups consecutive settled Tool results into a `tool-group`, while running root calls append at the flow tail. Both paths ultimately enter the same `ToolSeat`, so settled and running forms share the whole-Tool seat. Selection is passed only to the root containing that call, and `ToolCallTree` then renders recursively within that local tree.

## Code and responsibility boundaries

| Owner | Primary code | Owns | Explicitly does not own |
|---|---|---|---|
| Client Runtime | [`Session`](../../../../packages/client/runtime/src/client/sessions/session.ts), [`ToolCallTree`](../../../../packages/client/runtime/src/client/sessions/tool-call-tree.ts), [`history-fold.ts`](../../../../packages/client/runtime/src/client/session-history/history-fold.ts) | call/result pairing, running/settled lifecycle, recursive parent/child tree, snapshot structural sharing | Business views selected by Tool name |
| `ui-conversation` | [`chat-flow.ts`](../../../../packages/client/ui-conversation/src/client/chat/chat-flow.ts), [`ChatView.tsx`](../../../../packages/client/ui-conversation/src/client/chat/ChatView.tsx), [`slots.ts`](../../../../packages/client/ui-conversation/src/client/contract/slots.ts) | ChatFlow order, settled groups, running tail, scroll anchors, selection and host actions, whole-Tool seat declaration | subcall composition, `toolName` dispatch, Generic fallback, Tool card models |
| `ui-tool` | [`apply.ts`](../../../../packages/client/ui-tool/src/client/apply.ts), [`ToolCallTree.tsx`](../../../../packages/client/ui-tool/src/client/tool/ToolCallTree.tsx), [`slots.ts`](../../../../packages/client/ui-tool/src/client/contract/slots.ts) | root/subcall composition, atomic keyed dispatch, Generic fallback, Tool card models and built-in Tool views | ChatFlow ordering, Session Event fold |
| Business Tool plugins | [`ui-skill` registration example](../../../../packages/client/ui-skill/src/client/index.ts) | Atomic views for one or more wire Tool names | root/subcall placement and lifecycle pairing |
| Details path | [`DetailsPanel.tsx`](../../../../packages/client/ui-conversation/src/client/skeleton/DetailsPanel.tsx), [`ToolDetails.tsx`](../../../../packages/client/ui-tool/src/client/tool/ToolDetails.tsx) | selected-call lookup, card-aware output, and raw fallback | chat call-tree composition |

## Slot and owner contract

A slot declaration also constrains render ownership. The conversation chat entry declares `'conversation.chat.tool'` through `children`, so only `ChatView` places the whole-Tool seat. When `ui-tool` registers that seat, its `children` declares `'tool.call.toolview'`, so only `ToolCallTree` renders the atomic Tool seat. Business plugins register keyed entries only; they neither participate in root/subcall composition nor establish a registry parallel to slots.

The whole seat's `ToolTreeOwnerProps` carries the root `callId`, `toolName`, `ToolCallBlock`, `selectedCallId`, session `cwd`, `openFile(path)`, and `inspectCall(callId)`. `ToolCallTree` converts either a root or child into the same `ToolCallOwnerProps` and narrows inspect to a callback for that call. The atomic owner carries no `ReactNode`, Cordis `Context`, Session service, or projector; a business view consumes only one standard call block and host actions.

The seat filler also preserves the conversation DOM contract on every root and child wrapper: `data-chat-anchor-key="call:<callId>"`, `data-chat-call-id`, and `data-selected="true"` on the selected call. `ChatView` consumes the anchor key to restore prepend/paging position; the Tool owner emits it because it alone composes child wrappers.

Business plugins use one registration shape:

```text
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({
    name: 'tool.call.toolview',
    key: '<wire tool name>',
  }, BusinessToolRow))
```

`ui-tool`'s [`apply()`](../../../../packages/client/ui-tool/src/client/apply.ts) registers the whole-Tool renderer, details renderer, and existing built-in atomic views. An existing independent business package can move only its keyed registration, as `ui-skill` does, without changing `ui-conversation` or Session.

## Details path

[`DetailsPanel`](../../../../packages/client/ui-conversation/src/client/skeleton/DetailsPanel.tsx) locates the selected call recursively in `nodes` and `runningCalls` through their `subCalls`, and it owns input arguments, empty states, and panel lifecycle. It passes only `{ block, cwd }` to `'conversation.details.tool'`; [`ToolDetails`](../../../../packages/client/ui-tool/src/client/tool/ToolDetails.tsx) reuses Tool card models to render the output. When `ui-tool` is absent, a settled call falls back to raw result text and a running call shows conversation's running fallback, so details never imports the Tool implementation in reverse.

## Verification

Test ownership follows production ownership. `ui-conversation` tests install a local whole-Tool seat probe and assert only ChatFlow placement, owner payload, and host contracts such as selection, open-file, and inspect; they do not import `ui-tool` production code or test helpers. `ui-tool` tests mount a real conversation host and verify root/subcall composition, keyed dispatch, generic fallback, concrete Tool UI, and plugin lifecycle.

## Alternatives considered

**Keep atomic Tool slots under every conversation view.** Rejected: each view would have to reproduce root/subcall composition, and a Tool registration would be isolated by view even though its business meaning is Tool-wide. A whole-Tool seat preserves view-owned placement while giving the call tree one owner. This supersedes the per-view placement selected by the earlier [toolview dissolution](2026-07-23-toolview-dissolution.md), while retaining its keyed-slot and no-parallel-registry decisions.

**Move only the Tool React components and card models.** Rejected: `ChatView` would still own Tool-name dispatch and Code Dispatch composition, so the dependency would change file paths without changing responsibility.

**Add business-specific Session projectors or folds.** Rejected: ordinary Tool views consume the standard call block already reconstructed by Runtime. A second registry would create two authorities for call identity and historical replay. Only a feature that changes logged topology or lifecycle earns a Runtime-level extension.

**Make each atomic Tool view render its own subcalls recursively.** Rejected: the atomic registrant receives one Tool call and should not know whether it is a root or child. Recursive root/child composition belongs centrally to `ui-tool`'s `ToolCallTree`.

**Import `ui-tool` components directly from `ui-conversation`.** Rejected: it would reverse the intended feature direction and make Tool presentation mandatory. Declared slots retain lifecycle ownership, fallback behavior, and independent plugin loading.

## Consequences

`ui-conversation` becomes independent of Tool-name business presentation while retaining ChatFlow, selection, and host interaction responsibilities. Root calls and subcalls cannot drift onto different dispatch paths, and business packages can own atomic Tool presentation without Session changes. The cost is one new Client package and two cross-package slot seams; `ui-tool` also deliberately depends on conversation's declared seats and locale namespace. The assembled Web bundle therefore mounts `ui-tool`; omitting it leaves chat Tool seats empty while the details seat keeps its raw-result fallback, without changing Session reconstruction.
