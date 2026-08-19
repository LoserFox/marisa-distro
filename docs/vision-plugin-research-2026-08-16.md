# Awesome DSH Plugins vision candidates (2026-08-16)

Scope: source-level review of the vision rows in `awesome-dsh-plugins/PLUGINS.md`,
plus local package tests where dependencies were available. Repositories were
cloned at the commits visible on 2026-08-16. This note is evidence for selecting
a bundle candidate; it does not modify or vendor any plugin.

## Recommendation

`ysr666/dsh-vision-router` is the best turnkey candidate: the package's own CI
tests Node 22/24 and host-sharp resolution on Ubuntu/macOS/Windows, and the
local Windows run passed 159 tests. It provides image-turn routing, a no-key
fallback chain, and pixel-level tools without Python. Keep a configurable
provider fallback because the anonymous OVH service is rate limited and remote.

`Anionex/dsh-vision-toolkit` is the richest engineering option (OCR, grounding,
pixel verification, UI restoration, artifacts and Web+Headless), but requires
Python 3.11 and a managed runtime. Its CI is Linux + Python; local Windows run
had 100 passes and 42 failures, mostly symlink permission, missing PIL, or
external-provider/environment assumptions. Treat it as an optional advanced
profile, not the default bundle.

`Hyp6666/dsh-open-eyes` is the cleanest secure general adapter: OpenAI Responses,
Chat Completions and Anthropic protocols, DSH Credential References, workspace
fencing, and remote URL opt-in. It needs a configured vision provider and does
not provide the router's keyless path. Its local Windows run had 123 passes and
2 platform fixture failures (CRLF/POSIX path assumptions); upstream CI is Linux.

## Candidate evidence

| Candidate | Source evidence | Local check | Main permissions/risks |
|---|---|---|---|
| [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) v1.2.2 | README advertises 11 tools and OVH 5-model fallback; `.github/workflows/ci.yml` has Node 22/24 plus native host-sharp smoke on three OSes | `pnpm install --frozen-lockfile && pnpm test`: **159 passed, 0 failed** on Windows | Fetches configured/anonymous vision endpoints; writes workspace artifacts; invokes local tesseract/potrace/Chrome. Anonymous endpoints are ~2 req/min/IP/model; Web profile only. |
| [@anionex/dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) v0.1.7 | README pins upstream `agent-vision-toolkit` commit `bc9803d`; claims 10 tools, 168 tests, UI restoration 6.04%→0%; CI installs Python 3.11 and runs profile acceptance + vendored Python tests | **100 passed, 42 failed, 2 worker errors** on Windows; failures include EPERM symlink, missing `PIL`, missing external vision API and one package-layout assertion | Python managed cache/processes, remote API credential, artifact writes; high operational complexity but explicit path/credential fencing and cancellation. |
| [dsh-open-eyes](https://github.com/Hyp6666/dsh-open-eyes) v0.1.0 | README documents three protocols, DSH Credential Reference and local-workspace/remote-URL boundaries; CI runs typecheck/lint/test/build/e2e on Node 22.19/24 | **123 passed, 2 failed** (Windows tests expect LF/POSIX paths) | Configured third-party provider receives images; no anonymous default; WebUI bridge only for text-only routes. |
| [dsh-tool-vision](https://github.com/Scorp1o117/dsh-tool-vision) v0.3.8 | README documents `inspect_image`, pre-step image bridge, arbitrary OpenAI-compatible endpoint and Web settings | No test files (package has no test script) | Reads local paths or HTTP URLs and sends image data; API key in settings/env; URL/SSRF/privacy policy must be reviewed. |
| [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy) v0.2.3 | README documents DeepSeek+VLM route, DashScope/Zhipu/OpenRouter and auto-local Ollama; CI only Node 22/24 `npm test` + BOM check; one test file | `npm install` (postinstall privacy prompt; chose no key) + `npm test`: **14 passed, 0 failed** | Optional `sharp`; startup probes localhost Ollama; remote image egress; `postinstall` and sharp build scripts require pnpm approval; profile dump can expose configured key. |
| [dsh-visual-plugin](https://github.com/jyh20030112/dsh-visual-plugin) v0.2.3 | README claims Web panel, credential seam and prebuilt bundle; CI checks artifacts/manifest/npm pack only | Could not install in isolated clone: no lockfile and dev dependencies reference missing `../../deepseek-harness` | Configured OpenAI-compatible endpoint receives images; no runtime test evidence in clone. |

## Primary source links

- Catalogue rows: <https://github.com/AdamPlatin123/awesome-dsh-plugins/blob/main/PLUGINS.md>
- Router README/CI: <https://github.com/ysr666/dsh-vision-router>
- Toolkit README/CI: <https://github.com/Anionex/dsh-vision-toolkit>
- Open Eyes README/CI: <https://github.com/Hyp6666/dsh-open-eyes>
- Tool Vision README: <https://github.com/Scorp1o117/dsh-tool-vision>
- Vision Proxy README/CI: <https://github.com/Flyvhidbwo/dsh-vision-proxy>
- Visual Plugin README/CI: <https://github.com/jyh20030112/dsh-visual-plugin>
