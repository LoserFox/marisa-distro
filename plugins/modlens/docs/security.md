---
summary: 'Security: what modlens runs, how recovered images are protected, image content as untrusted input'
read_when:
  - Reviewing what this tool does on your machine
  - Recovering pastes on a shared machine
  - Deciding how much to trust what a vision engine reports
---

# Security

English | [中文](security.zh-CN.md)

## Recovered images are private

Images pulled out of session storage are written 0600 into a 0700 directory. By default that directory is a fresh, unpredictable `<tmpdir>/modlens-paste-*` minted per run, so nobody on a shared machine can pre-create a known path (`recursive` mkdir leaves an existing directory's mode alone) and read the bytes. A pasted screenshot can hold anything. An explicit `--out-dir` is honoured but refused when unsafe: it must be a real directory, not a symlink, owned by you, with no group or world access.

Recovery is also scoped to one project: the working directory recorded inside the transcript is checked, not just the directory name, because directory slugs collide (`/tmp/a.b` and `/tmp/a-b` produce the same one). A neighbouring project's images are never handed over.

## Permissions passed to engines

ModLens invokes `agy` with `--dangerously-skip-permissions` because prompt mode fails in some environments without it. The prompt restricts the agent to reading the one image it was given, and instructs it to treat image content strictly as data.

The `claude-cli` provider runs with `--allowedTools Read` only, so it can read local files and nothing else. The `kimi-cli` provider cannot be narrowed that way (its CLI has no equivalent flag), so it is treated differently in two respects: it runs only when named, never as a failover peer, since it spends a subscription; and it runs with skill discovery pointed at an empty directory, because otherwise kimi can find the modlens skill and read the image by running modlens, which is modlens calling itself. Its child also carries a marker that makes a nested modlens refuse to spawn kimi again.

The subprocess providers all run in a throwaway directory created fresh per call and removed afterward. For a local image it holds a private copy of that one image and nothing else, and it is a real copy, never a hardlink, so a provider writing to its temp path cannot touch the original. For a remote image the directory is empty and the agent downloads into it. Without this, text inside an image could steer a broadly-permissioned agent into reading files next to the original, or whatever project the caller happened to be in. Passing `--workdir` opts out and runs where you point it.

This is exposure reduction, not an OS sandbox: the agent can still read absolute paths, reach the network, and spawn processes. Treat it as a narrower default, not a security boundary. For images you do not trust, prefer `-p gemini-api`, which downloads the bytes itself and runs no local agent. Remote URLs already prefer the inline region: the failover chain for a remote URL tries the inline API providers first and the agents last. Who actually fetches a remote URL differs per provider, and only a local download can be guarded locally:

| Provider | Who fetches a remote URL | Local guards |
| :-- | :-- | :-- |
| `gemini-api` | modlens downloads, sends bytes inline | private-address guards, magic-byte check, 25 MB cap |
| `openai`, `anthropic` | the URL is passed to the vendor, which fetches it | none locally; the vendor's own fetching policy applies |
| `antigravity-cli`, agent CLIs | the agent fetches on its own | none locally |

So the private-address guards, the magic-byte check, and the size cap protect exactly the paths where modlens itself downloads: every local file read, and gemini-api's remote fetch. An explicit `-p` pins one provider and overrides the chain.

## Image content is untrusted input

Text inside an image is untrusted, the same as a web page. A screenshot can contain instructions aimed at whatever reads it. The prompt says so explicitly, but that is mitigation, not a guarantee: analyze images you are willing to open, and prefer a sandboxed working directory when they came from elsewhere.

## Evidence, not invention

What the engine cannot read goes into `uncertainty` rather than being filled in. v2 dropped pixel coordinates and confidence scores entirely, because those are the two fields models fabricate most convincingly.
