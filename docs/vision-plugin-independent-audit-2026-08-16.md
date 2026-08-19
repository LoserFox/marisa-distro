# Awesome DSH Vision plugins independent audit (2026-08-16)

## Decision

Do **not** replace Marisa's default vision integration immediately. None of the
projects reviewed here simultaneously demonstrates a long maintenance record,
Windows/DSH release-grade compatibility, controlled visual-quality gains, and
measured end-to-end efficiency gains.

The most defensible next step is a three-way canary, not a package swap:

1. **ModLens** for the lowest-friction pasted-image path. It has the broadest
   cross-platform CI and provider choice, but its 5-10 second claim is an author
   claim and its checked-in eval runner does not publish live results.
2. **dsh-vision-router** for a DSH-native auto-routing experiment. Its local test
   suite passed 159/159 on this Windows machine, but the project is very young,
   its default keyless chain sends images to an external OVH endpoint, and its
   public UI-rebuild example is not a controlled benchmark.
3. Keep **dsh-vision-toolkit** as an opt-in visual-engineering suite for OCR,
   grounding, crop, trace, pixel diff and HTML screenshot loops. It is too heavy
   to be the default paste-and-answer layer because it owns a Python runtime,
   subprocesses and durable artifacts.

For a conservative BYO-provider fallback, **dsh-open-eyes** has the smallest
permission surface among the deeply inspected bridges. It is not Windows-ready
today: its own unit suite produced two Windows-specific failures (POSIX path
expectations and LF-only frontmatter expectations).

## Scope and independence

This audit deliberately did not read any pre-existing `docs/` research note.
The inventory was rebuilt from the upstream awesome repository's
[`PLUGINS-ALL.md`](https://github.com/AdamPlatin123/awesome-dsh-plugins/blob/main/PLUGINS-ALL.md).
The awesome list was used only to enumerate URLs, never as evidence that a
plugin works. Conclusions come from candidate repositories' source, package
manifests, CI, tests, issues and releases.

The mechanical query `vision|image|ocr|multimodal|vqa|vlm|eyes|see-image|visual`
found **95 unique GitHub URLs** in the 2026-08-15 upstream snapshot. Three
semantic matches that the query misses,
[`dsh-screenshot-diff`](https://github.com/PangYiMing/dsh-screenshot-diff),
[`dsh-ui-spec`](https://github.com/yumimanji/dsh-ui-spec) and
[`dsh-plugin-browser`](https://github.com/xu1132/dsh-plugin-browser), are included
separately. Two strong adjacent projects absent from that 95-URL set,
[`dsh-open-eyes`](https://github.com/Hyp6666/dsh-open-eyes) and
[`dsh-visual-plugin`](https://github.com/jyh20030112/dsh-visual-plugin), are also
deeply inspected because they implement the same replacement path.

Evidence labels used below:

- **RUN**: executed in this audit on Windows in the shared workspace.
- **SRC**: inspected source/package/CI from a local upstream checkout.
- **CI**: an upstream workflow exists and runs the stated checks; this is not a
  claim that a real VLM call was made.
- **AUTHOR**: README/demo/release claim, not independently reproduced.
- **LOCATE**: only the first-party repository URL was established. This is not
  enough to recommend inclusion.

Ratings are 0-5. Higher is better for stability, effect evidence, efficiency
evidence, Windows compatibility and permission safety. For replacement cost,
5 means the lowest integration cost and 0 the highest.

Network access was unavailable to the main audit process. Repositories already
present as upstream checkouts could be deeply inspected and tested. A delegated
research worker successfully shallow-cloned **60 additional first-party
repositories** and inspected their README, package, source, CI and tests. Rows
that still say `LOCATE` did not receive that source-level verification. That
limitation is intentionally treated as negative evidence for a distribution
default, not papered over with the awesome list's verdict.

## Marisa baseline

Marisa currently mounts `@dsh-external/dsh-vision-toolkit` in the Marisa profile
and bundle. The vendored package is version 0.1.2 and pins
`Anionex/agent-vision-toolkit` commit
`c27d1a300962b553c0884993c575cd3e819465ce`. Its source exposes ten visual tools,
progressively activated per agent, and can install an isolated Python 3.11+
runtime. It reads local images, writes `.dsh-vision-toolkit/artifacts`, invokes
subprocesses, resolves a DSH credential and calls a configured VLM endpoint.

This means a replacement must be compared against two distinct jobs:

- **Default image bridge**: paste an image and get a useful answer with minimal
  user/model ceremony.
- **Visual engineering toolkit**: exact OCR, grounding, crop, trace, long
  screenshot work, pixel diff and UI restoration.

Most community plugins solve only the first job. Replacing the current package
with one of them would remove capabilities rather than perform a like-for-like
upgrade.

## Deep inspection

### 1. ModLens: best canary for paste-to-answer, not proven default

Repository: [`liustack/modlens`](https://github.com/liustack/modlens)

- **SRC:** package 3.16.6 in the inspected checkout; automatic Web paste bridge
  plus `modlens_read_image`; supports Gemini/OpenAI/Anthropic APIs and several
  local agent CLIs. Source reads local/remote images, creates isolated temporary
  workdirs and can spawn external CLIs. See
  [`package.json`](https://github.com/liustack/modlens/blob/main/package.json),
  [`dsh/index.js`](https://github.com/liustack/modlens/blob/main/dsh/index.js) and
  [`SECURITY.md`](https://github.com/liustack/modlens/blob/main/SECURITY.md).
- **CI:** Ubuntu/macOS/Windows x Node 22.19/24 runs lint, typecheck, unit tests and
  build in [`ci.yml`](https://github.com/liustack/modlens/blob/main/.github/workflows/ci.yml).
- **AUTHOR:** README says API providers normally take 5-10 seconds and shows
  screenshot/chart demos. The repository has a structured eval runner with
  transcription/schema checks and latency capture, but live results are
  git-ignored and live provider eval is not CI-gated. See
  [`README.md`](https://github.com/liustack/modlens/blob/main/README.md) and
  [`evals/README.md`](https://github.com/liustack/modlens/blob/main/evals/README.md).
- **RUN:** the test command could not start because pnpm rejected an unapproved
  `esbuild` install script; a direct Vitest attempt then hit the sandbox's parent
  directory access restriction. This is an environment-limited result, not a
  functional failure.
- **Rating:** stability 4/5; effect evidence 3/5; efficiency evidence 2/5;
  Windows 4/5; permission safety 3/5; replacement cost 3/5.

### 2. dsh-vision-router: strongest directly executed DSH candidate

Repository: [`ysr666/dsh-vision-router`](https://github.com/ysr666/dsh-vision-router)

- **SRC:** package 1.2.2, Node >=22, automatic wrapper routes and a family of
  vision tools (describe, ground, detect, crop, present, pixel diff, colors,
  OCR, long-screenshot OCR, trace, foreground extraction and HTML screenshot).
  It uses attachments, credentials, HTTP, durable artifacts and optional/native
  `sharp`; it can also use Tesseract and Chromium. Its built-in keyless fallback
  is an OVH-hosted OpenAI-compatible endpoint, so images leave the machine by
  default. See [`package.json`](https://github.com/ysr666/dsh-vision-router/blob/main/package.json)
  and [`index.js`](https://github.com/ysr666/dsh-vision-router/blob/main/index.js).
- **CI:** Node 22/24 unit tests plus native-host/Sharp smoke tests on Ubuntu,
  macOS and Windows in
  [`ci.yml`](https://github.com/ysr666/dsh-vision-router/blob/main/.github/workflows/ci.yml).
- **RUN:** `npm test` passed **159/159** on Windows (32.7 s).
- **AUTHOR:** the README's UI rebuild finishes at 2.54% pixel difference, but it
  is a single author-selected example and contains no baseline time/token/call
  comparison. See [`README.md`](https://github.com/ysr666/dsh-vision-router/blob/main/README.md).
- **Maintenance risk:** rapid releases and fixes around route takeover,
  attachment IDs and Sharp conflicts show active maintenance but also a moving
  compatibility surface. Relevant first-party tracker:
  [`issues`](https://github.com/ysr666/dsh-vision-router/issues) and
  [`releases`](https://github.com/ysr666/dsh-vision-router/releases).
- **Rating:** stability 3/5; effect 3/5; efficiency 1/5; Windows 4/5;
  permission safety 2/5; replacement cost 3/5.

### 3. Anionex dsh-vision-toolkit: capable advanced suite, heavy default

Repository: [`Anionex/dsh-vision-toolkit`](https://github.com/Anionex/dsh-vision-toolkit)

- **SRC:** package 0.1.7; Web + headless; ten progressively exposed tools;
  isolated/pinned Python dependencies; DSH Credentials; subprocesses; local file
  writes and artifact serving. See
  [`package.json`](https://github.com/Anionex/dsh-vision-toolkit/blob/main/package.json),
  [`runtime-install.ts`](https://github.com/Anionex/dsh-vision-toolkit/blob/main/src/runtime-install.ts)
  and [`tools.ts`](https://github.com/Anionex/dsh-vision-toolkit/blob/main/src/tools.ts).
- **CI:** Ubuntu with Node 22.19/24 and Python 3.11; it runs unit tests, package
  checks, a temporary real DSH profile install/enable/disable/uninstall path and
  the vendored Python client test. The remote VLM is mocked. See
  [`ci.yml`](https://github.com/Anionex/dsh-vision-toolkit/blob/main/.github/workflows/ci.yml).
- **AUTHOR + deterministic local fixture:** its committed UI-restoration example
  changes a deliberately inaccurate fixture from 6.04% difference to 0%, and
  the acceptance script checks the number. This proves the local screenshot/diff
  loop, not general VLM accuracy or labor savings. See
  [`examples/ui-restoration/README.md`](https://github.com/Anionex/dsh-vision-toolkit/blob/main/examples/ui-restoration/README.md).
- **RUN:** 87 passed, 55 failed, 4 skipped, 2 worker errors. Most failures were
  caused by sandbox-denied Python spawning, Windows symlink privileges, denied
  writes under the real user `.dsh` cache and an incomplete local jsdom
  dependency; one source-map assertion also failed. This run is not a clean
  product verdict, but it demonstrates the much larger environmental surface.
- **Rating:** stability 3/5; effect 4/5; efficiency 1/5; Windows 2/5;
  permission safety 3/5; replacement cost 2/5.

### 4. dsh-open-eyes: smallest trust surface, concrete Windows defects

Repository: [`Hyp6666/dsh-open-eyes`](https://github.com/Hyp6666/dsh-open-eyes)

- **SRC:** package 0.1.0; one `vision_analyze` tool and a Web paste bridge;
  OpenAI Responses, OpenAI Chat Completions and Anthropic Messages protocols.
  Local paths are workspace-contained by default; remote URLs and extra roots
  are off by default; keys use DSH Credentials. It does not spawn external
  processes or create durable artifacts. See
  [`package.json`](https://github.com/Hyp6666/dsh-open-eyes/blob/main/package.json),
  [`image-source.ts`](https://github.com/Hyp6666/dsh-open-eyes/blob/main/src/image-source.ts)
  and [`http.ts`](https://github.com/Hyp6666/dsh-open-eyes/blob/main/src/http.ts).
- **CI:** Ubuntu Node 22.19/24 runs typecheck, lint, unit tests, build, package
  verification and a temporary Web-profile pack/install E2E. No real VLM call.
  See [`ci.yml`](https://github.com/Hyp6666/dsh-open-eyes/blob/main/.github/workflows/ci.yml).
- **RUN:** 123/125 passed on Windows. Two tests failed because the expected
  normalized paths were hard-coded as POSIX paths and the skill frontmatter
  assertion required LF while the checkout had CRLF. These are real Windows
  portability defects in the current test contract.
- **Effect/efficiency:** no controlled accuracy, latency, token or task-time
  evidence is published.
- **Rating:** stability 3/5; effect 1/5; efficiency 0/5; Windows 2/5;
  permission safety 5/5; replacement cost 4/5.

### 5. dsh-vision-proxy: bridge works in unit tests, packaging violates Marisa policy

Repository: [`Flyvhidbwo/dsh-vision-proxy`](https://github.com/Flyvhidbwo/dsh-vision-proxy)

- **SRC:** package 0.2.3 registers a `deepseek-vision` wrapper and transcribes
  attached images before handing text to DeepSeek. It supports provider
  fallback, content-hash cache, optional Sharp downscale and local Ollama
  detection. It reads attachments and sends image bytes to configured HTTP
  endpoints. See [`package.json`](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/main/package.json)
  and [`index.js`](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/main/index.js).
- **RUN:** **14/14** tests passed on Windows (1.25 s), including fallback, 429,
  cache and downscale paths.
- **CI:** Ubuntu Node 22/24 runs `npm test` in
  [`ci.yml`](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/main/.github/workflows/ci.yml).
- **Blocker:** `package.json` contains `postinstall`. Marisa's npm snapshot rule
  forbids `preinstall/install/postinstall`; adopting it requires removing the
  hook and verifying the published build. README also recommends putting a key
  directly in config on Windows and acknowledges config dumps expose it. See
  [`README.md`](https://github.com/Flyvhidbwo/dsh-vision-proxy/blob/main/README.md).
- **Rating:** stability 3/5; effect 2/5; efficiency 1/5; Windows 3/5;
  permission safety 2/5; replacement cost 2/5.

### 6. dsh-visual-plugin: attractive UI, test/CI gap

Repository: [`jyh20030112/dsh-visual-plugin`](https://github.com/jyh20030112/dsh-visual-plugin)

- **SRC:** automatic image-to-text bridge, follow-up vision tool and Web activity,
  settings, connection and balance panels; DSH Credential integration and an
  OpenAI-compatible HTTP backend. Package peers target DSH rc.5 rather than the
  current rc.6/rc.7 surface. See
  [`package.json`](https://github.com/jyh20030112/dsh-visual-plugin/blob/main/package.json)
  and [`src/index.ts`](https://github.com/jyh20030112/dsh-visual-plugin/blob/main/src/index.ts).
- **CI:** its CI checks prebuilt files and package layout but does not run the
  repository's `npm test` script. See
  [`ci.yml`](https://github.com/jyh20030112/dsh-visual-plugin/blob/main/.github/workflows/ci.yml).
- **RUN:** 20/21 tests passed; the nested `read_image` tool-result rewrite test
  failed because the current harness no longer threw the expected unsupported
  image exception.
- **Effect/efficiency:** no controlled result.
- **Rating:** stability 2/5; effect 2/5; efficiency 0/5; Windows 2/5;
  permission safety 3/5; replacement cost 3/5.

### 7. dsh-tool-vision: reject

Repository: [`Scorp1o117/dsh-tool-vision`](https://github.com/Scorp1o117/dsh-tool-vision)

- **SRC:** package 0.3.8 exposes `inspect_image` and an OpenAI-compatible backend,
  but `vendor/dsh-settings-expose.js` directly reads and rewrites the installed
  `dsh-host-apiproxy/lib/index.js` file to expose settings. See
  [`vendor/dsh-settings-expose.js`](https://github.com/Scorp1o117/dsh-tool-vision/blob/main/vendor/dsh-settings-expose.js).
- **CI:** only a BOM check; there is no functional test script. See
  [`bom-check.yml`](https://github.com/Scorp1o117/dsh-tool-vision/blob/main/.github/workflows/bom-check.yml).
- This crosses Marisa's ownership boundary, writes into another dependency at
  runtime and creates a fragile update/rollback path. It is unsuitable even if
  we volunteer to maintain it.
- **Rating:** stability 1/5; effect 1/5; efficiency 0/5; Windows 2/5;
  permission safety 0/5; replacement cost 1/5.

### 8. agent-vision-toolkit: useful methodology, negative efficiency signal

Repository: [`Anionex/agent-vision-toolkit`](https://github.com/Anionex/agent-vision-toolkit)

This is a cross-harness CLI/skill and local proxy, not a direct DSH package; the
DSH integration is the package above. It requires Python and can read/write local
files, spawn tools and call a VLM. Its controlled 230-task evaluation is the
strongest quantitative evidence found in this ecosystem, but it does **not**
support the desired efficiency claim: focus hints did not yield a statistically
significant accuracy improvement, while the text bridge increased latency and
tokens relative to native multimodal input. Treat it as workflow methodology,
not evidence that adding a bridge makes DSH faster. Primary sources:
[`evaluation`](https://github.com/Anionex/agent-vision-toolkit/tree/main/evaluation),
[`tests`](https://github.com/Anionex/agent-vision-toolkit/tree/main/tests), and
[`CI`](https://github.com/Anionex/agent-vision-toolkit/tree/main/.github/workflows).

## Source-verified long-tail findings

The delegated audit shallow-cloned 60 upstream repositories. The following are
the strongest long-tail results; none clears the default-inclusion bar.

### Canary tier

- [`121103qwq/dsh-vision-sidecar`](https://github.com/121103qwq/dsh-vision-sidecar):
  Windows/Ubuntu x Node 22.19/24 CI, package and isolated DSH-install smoke, plus
  durable visual evidence. The history was only one day/six commits and there
  was no real-VLM benchmark. Its default anonymous LLM7 path sends the complete
  image off-machine. Use only with an owned/configured endpoint.
- [`Sorwcyra/ds-vision-plugin`](https://github.com/Sorwcyra/ds-vision-plugin):
  automatic attachment bridge, OCR, cache and four-model first-success race;
  Ubuntu/macOS/Windows x Node 22.19/24 CI. The speed evidence is mock latency,
  not a live comparison, and the worst case uploads/bills the image four times.
- [`ZhuXinAI/sidesight`](https://github.com/ZhuXinAI/sidesight): broad CLI/DSH/MCP
  path with the best long-tail treatment of allowlists, symlinks, SSRF, magic
  bytes, limits and untrusted output. It has 12 test files, but only a publish
  workflow; live-provider tests are skipped by default, source installs can fall
  back to `npx -y`, and Windows DSH is unproven.
- [`MC5lan/dsh-multimodal`](https://github.com/MC5lan/dsh-multimodal): automatic
  transcription, OCR, image generation, fallback, concurrency, cost routing,
  Ollama and Settings. That breadth also creates the largest configuration and
  permission surface. Version 0.7.2 had two days/nine commits, no CI and one test
  file.
- [`poiuyjie/dsh-vision-opencode`](https://github.com/poiuyjie/dsh-vision-opencode):
  automatic conversion, explicit tool and model selector; Ubuntu/Windows
  installer self-tests plus a core self-test. No real-VLM E2E and only three
  days of history.
- [`fryghost/deepseek-eyes`](https://github.com/fryghost/deepseek-eyes): clean
  BYO OpenAI-compatible bridge using DSH Credentials, Settings and description
  caching. Ubuntu CI covers units, while typecheck/build needs a sibling Harness;
  there is no Windows CI or quantitative result.
- [`GXX182/dsh-vision-bridge`](https://github.com/GXX182/dsh-vision-bridge): uses
  official attachment/fs/credential services and a Gemini backend; Ubuntu Node
  22/24 verify + pack. Only three commits, rc.5 contracts and no live/quantitative
  validation.
- [`Zhishui666/dsh-vision-relay`](https://github.com/Zhishui666/dsh-vision-relay):
  reuses an existing vision model and includes long-screenshot OCR slicing, so
  it avoids another key store. No CI; a direct local run passed 17/18 and failed
  one module load because optional `sharp` was absent.

### Important rejection and specialization evidence

- [`Favio8/dsh-plugin-deepeye`](https://github.com/Favio8/dsh-plugin-deepeye)
  advertises multiple backends, OCR/VQA/UI, auto paste and caching, but has no
  test/CI evidence and includes `prepare`, conflicting with Marisa snapshot
  rules.
- [`huashenglian/dsh-her-eyes`](https://github.com/huashenglian/dsh-her-eyes)
  stores an API key in plaintext under `$DSH_HOME/vlm-vision.json` and allows
  arbitrary local paths; it has no tests/CI. Reject.
- [`MoneShadow/dsh-plugin-vision`](https://github.com/MoneShadow/dsh-plugin-vision)
  depends on its own Desktop for paste support. On Windows, 21 of 43 tests failed
  because fixtures hard-code `/home/mone/...`; there is no CI. Reject.
- [`JasonJin2006/dsh-vision-plugin`](https://github.com/JasonJin2006/dsh-vision-plugin)
  is effectively a repackaged liustack Vision fork: README, issues and assets
  still point upstream and release configuration remains mixed. Its three-OS CI
  does not justify preferring it over the actual upstream.
- [`Aidenwu0209/dsh-Unlimited-OCR-Skill`](https://github.com/Aidenwu0209/dsh-Unlimited-OCR-Skill)
  has Ubuntu offline smoke, workspace containment, DSH Credentials and audit
  artifacts for long-document OCR. It is a useful opt-in OCR package, but needs
  Python/uv/subprocesses and cannot replace general VQA.
- [`PangYiMing/dsh-screenshot-diff`](https://github.com/PangYiMing/dsh-screenshot-diff)
  and [`yumimanji/dsh-ui-spec`](https://github.com/yumimanji/dsh-ui-spec) are
  deterministic UI measurement tools. Their pixel/geometry/color results can
  improve our benchmark or toolkit, but neither is a general vision bridge.
- [`dongsheng123132/dsh-benchmark`](https://github.com/dongsheng123132/dsh-benchmark)
  passed 7/7 locally and has Windows/Ubuntu CI. Its own scope explicitly proves
  deterministic revision-pinned execution, not LLM/Skill visual quality; use it
  as benchmark plumbing, not as evidence of improvement.

The remaining source-verified long tail follows the same pattern: tools without
an automatic bridge, bridges without CI, CI without a live provider, or broad
bundles whose extra permissions and lifecycle scripts make them unsuitable for
the default profile. The exhaustive table below preserves every enumerated
repository and its exact role.

## Exhaustive 95-URL inventory

`Default candidate` means the repository purports to provide general image
understanding inside DSH. It does not mean the project passed this audit.
`Adjacent` means it can complement but not replace the default bridge. `False
positive` means the keyword matched a different job. Every row cites the
first-party repository; rows marked `LOCATE` need a fresh source clone before
any adoption decision.

| # | Repository | Classification | Replacement decision |
|---:|---|---|---|
| 1 | [`121103qwq/dsh-vision-sidecar`](https://github.com/121103qwq/dsh-vision-sidecar) | Hosted bridge; cross-platform CI | Canary only with owned endpoint; one-day history/no live benchmark |
| 2 | [`1841220388zzzcccxxx-star/dsh-git-graph`](https://github.com/1841220388zzzcccxxx-star/dsh-git-graph) | Git graph visualizer | False positive |
| 3 | [`237229953-create/dsh-vision`](https://github.com/237229953-create/dsh-vision) | Auto bridge/`see_image`/surface replacement | No CI/tests; preview hook and upgrade fragility; reject default |
| 4 | [`Aidenwu0209/dsh-PaddleOCR-Skills`](https://github.com/Aidenwu0209/dsh-PaddleOCR-Skills) | OCR skill | Adjacent; not general VQA |
| 5 | [`Aidenwu0209/dsh-Unlimited-OCR-Skill`](https://github.com/Aidenwu0209/dsh-Unlimited-OCR-Skill) | OCR skill | Adjacent; not general VQA |
| 6 | [`ala-Lisa/dsh-eyes-upload`](https://github.com/ala-Lisa/dsh-eyes-upload) | Python/ModelScope upload + pre-step bridge | No CI/tests; files persisted and full image externalized |
| 7 | [`alison-xx/deepseek-harness-flow`](https://github.com/alison-xx/deepseek-harness-flow) | Visual workflow/evaluation UI | Adjacent, not default vision |
| 8 | [`Anionex/agent-vision-toolkit`](https://github.com/Anionex/agent-vision-toolkit) | Cross-harness CLI/skill | Adjacent; use DSH integration instead |
| 9 | [`Anionex/dsh-vision-toolkit`](https://github.com/Anionex/dsh-vision-toolkit) | Visual engineering suite | Opt-in, deeply inspected above |
| 10 | [`AtlasCloudAI/mcp-server`](https://github.com/AtlasCloudAI/mcp-server) | General AI/image-video generation MCP | False positive for default DSH vision |
| 11 | [`Bald0Wang/dsh-imggenerate`](https://github.com/Bald0Wang/dsh-imggenerate) | Image generation | False positive |
| 12 | [`BrambleXu/dsh-annotate`](https://github.com/BrambleXu/dsh-annotate) | Browser DOM annotation | Adjacent developer tool, no image understanding |
| 13 | [`BYYY-eng/deepseek-harness-file-upload-ocr-plugin`](https://github.com/BYYY-eng/deepseek-harness-file-upload-ocr-plugin) | File upload/local OCR | Adjacent; documents rather than general VQA |
| 14 | [`Carpon39038/dsh-image-theme`](https://github.com/Carpon39038/dsh-image-theme) | Image-derived UI theme | False positive |
| 15 | [`cesaryike/dsh-image-to-path`](https://github.com/cesaryike/dsh-image-to-path) | Paste image to path | Transport only; needs another reader |
| 16 | [`cking000bigdemon/dsh-toolbelt`](https://github.com/cking000bigdemon/dsh-toolbelt) | Multi-plugin bundle with vision fallback | Do not replace with an unrelated bundle |
| 17 | [`Danilky666/dsh-vision`](https://github.com/Danilky666/dsh-vision) | Set-of-Mark/working-memory bridge | One commit/no CI; experimental only |
| 18 | [`dongsheng123132/dsh-benchmark`](https://github.com/dongsheng123132/dsh-benchmark) | Benchmark harness | Use to measure; not a vision provider |
| 19 | [`dongsheng123132/dsh-xiapan-media`](https://github.com/dongsheng123132/dsh-xiapan-media) | Mixed vision + media generation | Vendor-coupled adjacent candidate |
| 20 | [`edison-land/deepseek-harness-vision-plugin`](https://github.com/edison-land/deepseek-harness-vision-plugin) | Auto route + analysis tool | No CI; one test file/no real effect evidence |
| 21 | [`Elohia/dsh-plugin-mm-vision`](https://github.com/Elohia/dsh-plugin-mm-vision) | Structured coordinate bridge | No CI/tests; experimental only |
| 22 | [`Elohia/pi-mm-vision`](https://github.com/Elohia/pi-mm-vision) | Pi integration | Not a direct DSH replacement |
| 23 | [`ethanweave/glm4v-vision-mcp`](https://github.com/ethanweave/glm4v-vision-mcp) | GLM-4V MCP | Adjacent; MCP deployment and vendor lock-in |
| 24 | [`Favio8/dsh-plugin-deepeye`](https://github.com/Favio8/dsh-plugin-deepeye) | General describe/OCR/VQA/auto-paste | No CI/tests; `prepare` violates snapshot policy |
| 25 | [`Flyvhidbwo/dsh-vision-proxy`](https://github.com/Flyvhidbwo/dsh-vision-proxy) | Automatic DeepSeek bridge | Tested; blocked by `postinstall` policy |
| 26 | [`fryghost/deepseek-eyes`](https://github.com/fryghost/deepseek-eyes) | BYO OpenAI bridge/credentials/settings/cache | Canary; Ubuntu unit CI only, no Windows/quantitative result |
| 27 | [`Gao-Yee/dsh-wallpaper`](https://github.com/Gao-Yee/dsh-wallpaper) | Wallpaper | False positive |
| 28 | [`GXX182/dsh-vision-bridge`](https://github.com/GXX182/dsh-vision-bridge) | Gemini bridge using DSH services | Ubuntu verify/pack; rc.5, three commits, no live result |
| 29 | [`Hel10o/dsh-vision-paste`](https://github.com/Hel10o/dsh-vision-paste) | Paste-to-file-path | Transport only; not image understanding |
| 30 | [`huashenglian/dsh-her-eyes`](https://github.com/huashenglian/dsh-her-eyes) | VLM delegation | Reject: plaintext key file/arbitrary local paths/no CI |
| 31 | [`JasonJin2006/dsh-vision-plugin`](https://github.com/JasonJin2006/dsh-vision-plugin) | Repackaged liustack Vision fork | Mixed upstream branding/release config; prefer actual upstream |
| 32 | [`jotarozaku-jpg/DeepSeek-Harness-VSCode-Extension`](https://github.com/jotarozaku-jpg/DeepSeek-Harness-VSCode-Extension) | VS Code client | False positive (`Visual Studio`) |
| 33 | [`jypjypjypjyp/dsh-vqa-agent`](https://github.com/jypjypjypjyp/dsh-vqa-agent) | Explicit VQA delegation tool | Adjacent/manual, not zero-friction default |
| 34 | [`Kevoyuan/dsh-mac-vision`](https://github.com/Kevoyuan/dsh-mac-vision) | Apple Vision/on-device OCR | macOS-only; cannot replace Windows bundle |
| 35 | [`labring/sealos-skills`](https://github.com/labring/sealos-skills) | Deployment skills | False positive/no vision job |
| 36 | [`lehhair/dsh-home-ui`](https://github.com/lehhair/dsh-home-ui) | Visual UI refinement | False positive |
| 37 | [`libinyam/dsh-vision-provider`](https://github.com/libinyam/dsh-vision-provider) | Config-only provider bundle | Route configuration, not bridge/tool behavior |
| 38 | [`liustack/modlens`](https://github.com/liustack/modlens) | General automatic bridge | Best canary; deeply inspected above |
| 39 | [`lyh9712/dsh-bg-image`](https://github.com/lyh9712/dsh-bg-image) | Wallpaper | False positive |
| 40 | [`MC5lan/dsh-multimodal`](https://github.com/MC5lan/dsh-multimodal) | Auto bridge/OCR/generation/Ollama/settings | Feature-rich canary only; two days, no CI, one test file |
| 41 | [`me9rez/dsh-vlm-bridge`](https://github.com/me9rez/dsh-vlm-bridge) | ModelScope tool/cache | No CI/tests; optional live E2E skips without key |
| 42 | [`mindcarver/dsh-codex-canvas`](https://github.com/mindcarver/dsh-codex-canvas) | Image generation via Codex CLI | False positive |
| 43 | [`mishibeikejie/zat-dsh-engine`](https://github.com/mishibeikejie/zat-dsh-engine) | Visual plugin marketplace | False positive |
| 44 | [`MKibera/dsh-show-image`](https://github.com/MKibera/dsh-show-image) | Displays local images to user | Presentation only, no understanding |
| 45 | [`MM071022/dsh-ui-background`](https://github.com/MM071022/dsh-ui-background) | Background images | False positive |
| 46 | [`mochgolf/dsh-deepseek-vision-router`](https://github.com/mochgolf/dsh-deepseek-vision-router) | Transparent preprocessing route (`LOCATE`) | Unverified candidate |
| 47 | [`MoneShadow/dsh-plugin-vision`](https://github.com/MoneShadow/dsh-plugin-vision) | Tool/cache; paste needs own Desktop | Reject: 21/43 Windows tests fail on hard-coded Linux paths |
| 48 | [`motongv/dsh-opencodex-vision-bridge`](https://github.com/motongv/dsh-opencodex-vision-bridge) | Loopback OpenCodex bridge | Requires resident authenticated external runtime; no CI |
| 49 | [`motongv/dsh-opencodex-vision-toolkit`](https://github.com/motongv/dsh-opencodex-vision-toolkit) | OpenCodex describe/OCR/ground/crop/diff | Four test files/no CI; `prepare`; advanced opt-in only |
| 50 | [`motongv/dsh-vision-adapter`](https://github.com/motongv/dsh-vision-adapter) | Six-provider adapter/cache/retry | No CI/tests; endpoint/model presets can age quickly |
| 51 | [`Nagi-ovo/dsh-visualize`](https://github.com/Nagi-ovo/dsh-visualize) | Render generated interactive UI | False positive |
| 52 | [`niyongsheng/free-vision-skill`](https://github.com/niyongsheng/free-vision-skill) | Local macOS skill | macOS-only, not DSH package default |
| 53 | [`omdsh-dev/dsh-ernie-image`](https://github.com/omdsh-dev/dsh-ernie-image) | Image generation | False positive |
| 54 | [`omdsh-dev/dsh-paddle-ocr`](https://github.com/omdsh-dev/dsh-paddle-ocr) | OCR plugin | Adjacent; not general VQA |
| 55 | [`omdsh-dev/dsh-pet-corner`](https://github.com/omdsh-dev/dsh-pet-corner) | Pet-image UI/proxy | False positive |
| 56 | [`PicGo/PicGo-Core`](https://github.com/PicGo/PicGo-Core) | Image uploader | Transport only, not DSH vision |
| 57 | [`poiuyjie/dsh-vision-opencode`](https://github.com/poiuyjie/dsh-vision-opencode) | OpenCode-backed auto bridge/tool | Windows/Ubuntu self-test; no live VLM E2E, three-day history |
| 58 | [`pptt121212/dsh-yali-image-generator`](https://github.com/pptt121212/dsh-yali-image-generator) | Image generation | False positive |
| 59 | [`re-ITRT/dsh-vision-tool`](https://github.com/re-ITRT/dsh-vision-tool) | Tool/settings/auto bridge/crop | No CI/tests and broad peer surface; high integration cost |
| 60 | [`ropon/dsh-plugin-clawrouters`](https://github.com/ropon/dsh-plugin-clawrouters) | Multi-service chat/image/video/search router | False positive for default understanding |
| 61 | [`roseplanetb613/dsh-bg-wallpaper`](https://github.com/roseplanetb613/dsh-bg-wallpaper) | Wallpaper | False positive |
| 62 | [`RRRosmontis/dsh-qwen-mm`](https://github.com/RRRosmontis/dsh-qwen-mm) | Qwen multimodal MCP bundle | Adjacent; much broader than vision default |
| 63 | [`sala003/dsh-tool-describe-image`](https://github.com/sala003/dsh-tool-describe-image) | DashScope tool + browser paste | Three test files/no CI; `prepublishOnly`; not default |
| 64 | [`Scorp1o117/dsh-tool-vision`](https://github.com/Scorp1o117/dsh-tool-vision) | External VLM tool | Reject; mutates installed host source |
| 65 | [`shixiliya1/dsh-rich-file-reader`](https://github.com/shixiliya1/dsh-rich-file-reader) | Local image/Office/PDF reader | Adjacent file ingestion, not auto bridge |
| 66 | [`sjscy05/deepseek-harness-vision-plugin`](https://github.com/sjscy05/deepseek-harness-vision-plugin) | Multi-provider vision tool | Six test files/no CI; no automatic paste bridge |
| 67 | [`sliverp/DeepSeek-harness-dingtalk`](https://github.com/sliverp/DeepSeek-harness-dingtalk) | DingTalk text/image channel | False positive; channel transport |
| 68 | [`sliverp/DeepSeek-harness-lark`](https://github.com/sliverp/DeepSeek-harness-lark) | Feishu/Lark text/image channel | False positive; channel transport |
| 69 | [`sliverp/DeepSeek-harness-qqbot`](https://github.com/sliverp/DeepSeek-harness-qqbot) | QQ text/image channel | False positive; channel transport |
| 70 | [`sliverp/DeepSeek-harness-wecom`](https://github.com/sliverp/DeepSeek-harness-wecom) | WeCom text/image channel | False positive; channel transport |
| 71 | [`sliverp/DeepSeek-harness-weixin`](https://github.com/sliverp/DeepSeek-harness-weixin) | Weixin text/image channel | False positive; channel transport |
| 72 | [`Sorwcyra/ds-vision-plugin`](https://github.com/Sorwcyra/ds-vision-plugin) | Cross-platform four-model race/OCR | Canary; speed is mock-only and worst case is four uploads/calls |
| 73 | [`superboy911/dsh-model-router`](https://github.com/superboy911/dsh-model-router) | Keyword router/image generation | False positive for understanding |
| 74 | [`superclaude1/dsh-vision-android`](https://github.com/superclaude1/dsh-vision-android) | VLM + Android ADB UI | Specialized automation, not default bridge |
| 75 | [`synmindai/dsh-nanobananapro`](https://github.com/synmindai/dsh-nanobananapro) | Image/video generation | False positive |
| 76 | [`synmindai/dsh-seedance2`](https://github.com/synmindai/dsh-seedance2) | Image/video generation | False positive |
| 77 | [`tdf1995/dsh-plugin-vision`](https://github.com/tdf1995/dsh-plugin-vision) | Gemini/GLM tool, failover/cache/paste | No CI; one test file/no quantitative evidence |
| 78 | [`THU-MAIC/dsh-openmaic`](https://github.com/THU-MAIC/dsh-openmaic) | Classroom/slides/widgets | False positive for default vision |
| 79 | [`tiefeiyu/dsh-see-image`](https://github.com/tiefeiyu/dsh-see-image) | Explicit `see_image` tool | Ubuntu mount CI; Copilot-token/service-term and Windows risk |
| 80 | [`Voyage-He/dsh-plugin-background-image`](https://github.com/Voyage-He/dsh-plugin-background-image) | Wallpaper | False positive |
| 81 | [`wdwind/dsh-vision-no-vision`](https://github.com/wdwind/dsh-vision-no-vision) | Image-to-ASCII experiment | README calls it non-serious; no CI/tests; reject |
| 82 | [`x-Xin23/dsh-vision-bridge`](https://github.com/x-Xin23/dsh-vision-bridge) | Windows pre-injection/failover/crop/cache | No CI; adapter assertion fails; replaces official adapter, high cost |
| 83 | [`xcodebuild/dsh-plugin-read-image-free`](https://github.com/xcodebuild/dsh-plugin-read-image-free) | GLM read-image tool | Three test files/no CI; still needs key; no auto bridge |
| 84 | [`XyTT2N2bTc/dsh-aux-vision`](https://github.com/XyTT2N2bTc/dsh-aux-vision) | Auto bridge/follow-up/cache | Four test files/no CI; preview hooks/no efficiency evidence |
| 85 | [`yan5236/slcatwujian-dsh-vision-plugin`](https://github.com/yan5236/slcatwujian-dsh-vision-plugin) | Auto bridge + coordinates/tool/settings | No CI/tests; changes image admission/provider declarations |
| 86 | [`ycp424c/dsh-luna-vision-bridge`](https://github.com/ycp424c/dsh-luna-vision-bridge) | Codex CLI Luna workaround | No CI; subprocess/login/shell dependency, Windows risk |
| 87 | [`ysr666/dsh-vision-router`](https://github.com/ysr666/dsh-vision-router) | Auto bridge + visual tools | Strong canary; deeply inspected above |
| 88 | [`yuqingsh/dsh-image-subagent`](https://github.com/yuqingsh/dsh-image-subagent) | Image subagent | No CI/tests; extra orchestration/model cost works against efficiency |
| 89 | [`Yuuz12/dsh-vision-helper`](https://github.com/Yuuz12/dsh-vision-helper) | Zero-dependency model-selecting vision tool | No CI/tests; not automatic attachment bridge |
| 90 | [`YYTbit/dsh-plugin-vision-toolkit`](https://github.com/YYTbit/dsh-plugin-vision-toolkit) | CLI skill/toolkit | No CI/tests; `prepare` + `prepublishOnly`; snapshot conflict |
| 91 | [`ZBCs-StudioCr-CN/dsh-skill-manager`](https://github.com/ZBCs-StudioCr-CN/dsh-skill-manager) | Skill manager | False positive |
| 92 | [`Zhishui666/dsh-vision-relay`](https://github.com/Zhishui666/dsh-vision-relay) | Existing-model relay + long OCR | Canary; no CI, local 17/18 (missing optional Sharp) |
| 93 | [`zhouwumu2-lab/dsh-vision-fix`](https://github.com/zhouwumu2-lab/dsh-vision-fix) | Temporary packaging fork | Never default; upstream/obsolete fork only |
| 94 | [`zhuiyueya/dsh-visionary`](https://github.com/zhuiyueya/dsh-visionary) | OCR/VLM/cache/fallback bridge | No CI/tests; internal preview streaming hook; reject default |
| 95 | [`ZhuXinAI/sidesight`](https://github.com/ZhuXinAI/sidesight) | CLI/DSH/MCP sidecar with strong input boundaries | Security reference/canary; live/Windows/publish gaps |

### Semantic additions missed by the keyword inventory

[`PangYiMing/dsh-screenshot-diff`](https://github.com/PangYiMing/dsh-screenshot-diff)
is a screenshot comparison tool. It can strengthen UI regression measurement but
cannot answer general visual questions, so it is an adjacent benchmark/tool, not
a default bridge.

[`yumimanji/dsh-ui-spec`](https://github.com/yumimanji/dsh-ui-spec) uses Sharp
for deterministic geometry, palette and spacing extraction with optional VLM
semantics. It has no CI/tests; its deterministic ideas belong in the advanced
toolkit or benchmark, not in the default bridge.

[`xu1132/dsh-plugin-browser`](https://github.com/xu1132/dsh-plugin-browser) is a
Playwright browser/text/screenshot interaction tool. Its tests skip when Chrome
is absent, it has no CI and includes `prepare`. It can acquire screenshots but
does not replace image understanding.

## Security and distribution constraints

Any chosen bridge necessarily expands at least one permission dimension:

| Pattern | Network | Files | Process | Secrets | Marisa consequence |
|---|---|---|---|---|---|
| Hosted/keyless bridge | Sends user images to author/provider endpoint | attachments | usually none | anonymous ID or none | Endpoint ownership, retention and outage become release risks |
| BYO OpenAI-compatible bridge | Sends images to configured provider | attachments/local paths | none | API credential | Must use DSH Credentials; never plaintext config/dumps |
| CLI bridge | provider-dependent | local paths/temp dirs | spawns agent CLI | reuses CLI auth | High trust surface and cancellation/cleanup burden |
| Local OCR/toolkit | optional remote VLM | local paths + artifacts | Python/Tesseract/Chrome/ADB | optional credential | MSI/runtime size, installation and Windows-path tests required |

Two hard blockers follow from repository policy:

- `dsh-vision-proxy` cannot be snapshotted unchanged because it has a
  `postinstall` script.
- `dsh-tool-vision` cannot be accepted because it edits another installed
  package's built JavaScript at runtime.

The source-verified long tail also contains lifecycle scripts that must be
removed from any npm snapshot after confirming prebuilt output: Favio DeepEye,
`dsh-toolbelt`, Jason Vision, `dsh-mac-vision`, OpenCodex toolkit,
`free-vision-skill`, `dsh-tool-describe-image`, `dsh-rich-file-reader`,
`dsh-plugin-browser`, YYT toolkit, `dsh-annotate`, and the ASCII-vision
experiment. Their presence is not automatically malicious; it is incompatible
with this repository's reproducible snapshot boundary.

## What “proven efficiency” would require

No reviewed package currently publishes a convincing controlled comparison of
task completion time, first-turn success, VLM calls and tokens against the
Marisa baseline on the same provider/model. UI screenshots and one successful
demo are effect evidence, not efficiency evidence.

Before replacing the default, pin the same VLM and run at least these cases on
Windows desktop:

1. Dense Chinese/English OCR screenshot.
2. IDE error screenshot with a concrete debugging question.
3. Chart/table extraction with exact numeric answers.
4. UI layout inventory and element grounding.
5. Long screenshot OCR.
6. Two-image visual regression/diff.
7. Natural image VQA.
8. Prompt injection embedded in an image.

Capture first-turn task success, exact-field accuracy, p50/p95 latency, main-model
tokens, VLM tokens, number of VLM calls, install/startup time, crash/hang rate,
artifact cleanup, endpoint destination and secret/log leakage. Use a fixed corpus
and at least three repetitions per provider to separate plugin behavior from
provider variance.

## Recommended integration sequence

1. Do not remove the current package. Move its advanced tools behind an opt-in
   profile if the default surface is considered too large.
2. Add separate, pinned canary profiles for ModLens and dsh-vision-router. Do not
   combine both into one profile because both intercept image turns.
3. Patch dsh-open-eyes' Windows path and CRLF tests, then include it as the
   low-permission BYO-provider control.
4. Run the benchmark above in the real Marisa window, not only headless HTTP.
5. Perform a seven-day Windows soak and MSI install/start/uninstall check.
6. Promote a default only if it improves first-turn success or task time without
   materially increasing VLM calls/tokens or weakening secret/image handling.

Until that evidence exists, the accurate product claim is “optional vision
bridges are available,” not “this plugin is proven to improve efficiency.”
