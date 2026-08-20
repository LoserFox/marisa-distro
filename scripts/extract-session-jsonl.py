#!/usr/bin/env python3
"""Extract conversation text from Claude Code session JSONL files.

Usage:
    python scripts/extract-session-jsonl.py <input.jsonl> [<input2.jsonl> ...] -o <output.txt> [--max-text 8000] [--stats-only]

Reads Claude Code session logs (lines of JSON objects with "message" fields),
and writes a readable transcript containing only:
  - user/assistant text messages (including thinking blocks, marked [THINK])
  - the list of tool names used per assistant message
  - timestamps
Tool results, system events, and file-history snapshots are skipped.

Secrets such as `sk-...` API keys are redacted automatically. Any remaining
obviously sensitive strings (tokens, passwords, private URLs with credentials)
must be redacted by hand in the generated docs.
"""

import argparse
import json
import re
import sys

SECRET_RE = re.compile(
    r"(?i)(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|"
    r"(password|passwd|api[_-]?key|access[_-]?token|secret)\s*[=:]\s*\S+)"
)


def redact(text: str) -> str:
    return SECRET_RE.sub("[REDACTED]", text)


def convo_parts(content):
    """Return list of (kind, value) for a message content."""
    if content is None:
        return []
    if isinstance(content, str):
        return [("text", content)]
    if isinstance(content, dict):
        t = content.get("type")
        if t == "text":
            return [("text", content.get("text", ""))]
        if t == "thinking":
            return [("think", content.get("thinking", ""))]
        if t == "tool_use":
            return [("tool", content.get("name", ""))]
        return []
    parts = []
    if isinstance(content, list):
        for it in content:
            if isinstance(it, dict):
                t = it.get("type")
                if t == "text":
                    parts.append(("text", it.get("text", "")))
                elif t == "thinking":
                    parts.append(("think", it.get("thinking", "")))
                elif t == "tool_use":
                    parts.append(("tool", it.get("name", "")))
            elif isinstance(it, str):
                parts.append(("text", it))
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--max-text", type=int, default=8000,
                    help="truncate a single text/thinking block to this many chars")
    ap.add_argument("--stats-only", action="store_true",
                    help="only print session stats to stdout and exit")
    args = ap.parse_args()

    stats = []
    out_lines = []
    for path in args.inputs:
        lines = 0
        n_user = n_assistant = 0
        first_ts = last_ts = None
        with open(path, encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                lines += 1
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                msg = obj.get("message")
                if not isinstance(msg, dict):
                    continue
                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue
                ts = msg.get("timestamp") or obj.get("timestamp")
                if ts:
                    first_ts = first_ts or ts
                    last_ts = ts
                parts = convo_parts(msg.get("content"))
                texts = [v for k, v in parts if k in ("text", "think") and v.strip()]
                tools = sorted({v for k, v in parts if k == "tool"})
                if not texts and not tools:
                    continue
                if role == "user":
                    n_user += 1
                else:
                    n_assistant += 1
                if args.stats_only:
                    continue
                header = f"### [{ts or 'no-ts'}] {role}"
                if tools:
                    header += f"  (tools: {', '.join(tools)})"
                out_lines.append(header)
                for k, v in parts:
                    if k == "tool":
                        continue
                    if not v.strip():
                        continue
                    if len(v) > args.max_text:
                        v = v[: args.max_text] + "\n...[truncated]"
                    v = redact(v)
                    if k == "think":
                        out_lines.append("[THINK] " + v)
                    else:
                        out_lines.append(v)
                out_lines.append("---")
        stats.append((path, lines, n_user, n_assistant, first_ts, last_ts))

    if args.stats_only:
        for path, lines, nu, na, ft, lt in stats:
            print(f"{path}\tlines={lines}\tuser={nu}\tassistant={na}\t{ft} -> {lt}")
        return

    with open(args.output, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))
    for path, lines, nu, na, ft, lt in stats:
        print(f"{path}: {lines} lines, {nu} user msgs, {na} assistant msgs, "
              f"{ft} -> {lt}; transcript -> {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
