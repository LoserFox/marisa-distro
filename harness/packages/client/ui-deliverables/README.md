# @deepseek-ai/dsh-client-ui-deliverables

English | [中文](README.zh.md)

Produced-files feature owner: registers the deliverables row a finished turn ends with into the chat view's `conversation.chat.turnTail` hole. All policy lives here; removing this plugin's line from cordis.yml removes the surface entirely, and the owning view renders an empty hole at zero cost.

`producedForClosing` derives one turn's produced files from the tail hole's owner currency — the finalized snapshot nodes and the closing assistant's seq. The vocabulary is the mutation tools' own follow-along `locations`, never the closing prose: a produced file is listed whether or not the model remembered to name it. A mutation is recognized by render intent, not tool name — a diff card, or a generic card whose `kind` is `edit` (the shape `str_replace_editor`'s insert presents) — so a new mutation tool joins by declaring what it does. Reads, deletes, and failed calls contribute nothing; a path appears once per turn in first-seen order; accumulation resets on the turn boundary, so a turn that mutates and then ends without content text cannot spill into the next turn's row.

`ProducedFiles` renders the row between the closing message's body and its IconActions footer: a quiet label, up to six chips (basename text, full path as the `title`), and an explicit remainder count past the cap. Each chip opens through the owner-supplied `openFile` — the same Host opener the tool rows use, with the chat view resolving relative paths against the session cwd. Design rationale: the [workspace file links Agent Note](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.md).

## Model Experience

None, as the row is a pure client derivation over already-logged tool metadata and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Prose mentions stay inert.** An inline-code file name in the closing message does not open the file yet; linking it to the same `locations` vocabulary is the stacked follow-up.
