package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// newMergeFixture 造一对目录：旧 backend（含用户数据、junction、可损坏的
// marisa profile）与新 staging（bundle 自带 .dsh 部署物）。旧树的
// package.json 由各用例自行写入（覆盖损坏/有效两种场景）。
func newMergeFixture(t *testing.T) (srcDsh, dstDsh string) {
	t.Helper()
	backend := t.TempDir()
	srcDsh = dshHomePath(backend)
	dstDsh = filepath.Join(t.TempDir(), ".dsh")

	// 旧树：顶层用户数据。
	writeTestFile(t, filepath.Join(srcDsh, "settings.yaml"), "theme: dark\n")
	writeTestFile(t, filepath.Join(srcDsh, "sessions", "proj", "s1", "session.jsonl.zstd"), "zstd-bytes")
	writeTestFile(t, filepath.Join(srcDsh, "storages", "workspace.json"), "{}")
	writeTestFile(t, filepath.Join(srcDsh, ".credentials.yaml"), "key: value")
	// 旧树：profiles/marisa —— junction + 用户新增文件（cordis.patch.yml）。
	marisa := filepath.Join(srcDsh, "profiles", "marisa")
	if err := os.MkdirAll(marisa, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(marisa, "cordis.patch.yml"), "- id: user-row\n")
	link := filepath.Join(marisa, "node_modules")
	target := filepath.Join(backend, "node_modules")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(target, "marker.txt"), "modules")
	if runtime.GOOS == "windows" {
		if err := createJunction(link, target); err != nil {
			t.Fatalf("create junction: %v", err)
		}
	} else {
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("symlink unavailable: %v", err)
		}
	}
	// 旧树：profiles/web（bundle 模板，不应迁移）。
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "web", "package.json"), `{"name":"web-old"}`)

	// 新树（bundle 自带部署物）。
	newMarisa := filepath.Join(dstDsh, "profiles", "marisa")
	if err := os.MkdirAll(newMarisa, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(newMarisa, "package.json"), "{\n  \"name\": \"marisa-marisa\",\n  \"version\": \"0.1.0\"\n}\n")
	writeTestFile(t, filepath.Join(newMarisa, "desktop.overlay.yml"), "- id: webserver\n")
	writeTestFile(t, filepath.Join(newMarisa, "standalone.overlay.yml"), "- id: webserver\n")
	writeTestFile(t, filepath.Join(newMarisa, "pnpm-workspace.yaml"), "packages: []\n")
	writeTestFile(t, filepath.Join(newMarisa, "cordis.yml"), "[]\n")
	writeTestFile(t, filepath.Join(dstDsh, "profiles", "web", "package.json"), `{"name":"web-new"}`)
	// 用户插件目录（file: 依赖存在性校验的落点，位于 backend 根）。
	writeTestFile(t, filepath.Join(filepath.Dir(dstDsh), "plugins", "my-user-plugin", "package.json"), `{"name":"my-user-plugin"}`)
	return srcDsh, dstDsh
}

func TestMergeDshDataMigratesUserData(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	// 旧 marisa package.json 有效（用户改过：加了一个插件）。
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "package.json"),
		"{\n  \"name\": \"marisa-marisa\",\n  \"dependencies\": {\"my-plugin\": \"file:../plugins/my-plugin\"}\n}\n")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	// 顶层用户数据全部迁入。
	for _, rel := range []string{
		"settings.yaml",
		filepath.Join("sessions", "proj", "s1", "session.jsonl.zstd"),
		filepath.Join("storages", "workspace.json"),
		".credentials.yaml",
	} {
		if _, err := os.Stat(filepath.Join(dstDsh, rel)); err != nil {
			t.Fatalf("migrated tree missing %s: %v", rel, err)
		}
	}
	// 用户新增的 cordis.patch.yml 保留。
	if data, err := os.ReadFile(filepath.Join(dstDsh, "profiles", "marisa", "cordis.patch.yml")); err != nil || string(data) != "- id: user-row\n" {
		t.Fatalf("user patch file not preserved: %q err=%v", data, err)
	}
}

func TestMergeDshDataManifestMergeKeepsReleaseRows(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	// 旧 package.json 是「上一版发行组合」：无用户自定义，也没有新版新增的
	// 插件行。升级后必须跟随新版本（profile 会随发行版更新）。
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "package.json"),
		"{\n  \"name\": \"marisa-marisa\",\n  \"version\": \"0.0.9\",\n  \"dependencies\": {\"dsh-old-plugin\": \"file:../../../plugins/dsh-old-plugin\"},\n  \"dsh\": {\"profile\": {\"bundles\": [\"@deepseek-ai/dsh-base\", \"marisa-bundle\", \"dsh-old-plugin\"]}}\n}\n")
	// 新 bundle 版含新版插件行。
	newPkg := filepath.Join(dstDsh, "profiles", "marisa", "package.json")
	writeTestFile(t, newPkg,
		"{\n  \"name\": \"marisa-marisa\",\n  \"version\": \"0.1.0\",\n  \"dependencies\": {\"dsh-new-plugin\": \"file:../../../plugins/dsh-new-plugin\"},\n  \"dsh\": {\"profile\": {\"bundles\": [\"@deepseek-ai/dsh-base\", \"@deepseek-ai/dsh-web-app\", \"marisa-bundle\", \"dsh-new-plugin\"]}}\n}\n")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(newPkg)
	if err != nil {
		t.Fatal(err)
	}
	s := string(data)
	// 新版本行全部生效。
	for _, want := range []string{`"version": "0.1.0"`, "dsh-new-plugin", "@deepseek-ai/dsh-web-app"} {
		if !containsStr(s, want) {
			t.Fatalf("release row %q lost after merge, got: %s", want, s)
		}
	}
	// 旧版本独有行不残留（同 key 以新为准 / 非用户行不追加）。
	if containsStr(s, "dsh-old-plugin") {
		t.Fatalf("stale release row leaked into merged manifest: %s", s)
	}
}

func TestMergeDshDataManifestMergeKeepsUserRows(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	// 旧 package.json：发行版组合 + 用户手动挂载的插件（dsh plugin add）。
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "package.json"),
		"{\n  \"name\": \"marisa-marisa\",\n  \"version\": \"0.0.9\",\n  \"dependencies\": {\"dsh-new-plugin\": \"file:../../../plugins/dsh-new-plugin\", \"my-user-plugin\": \"file:../../../plugins/my-user-plugin\"},\n  \"dsh\": {\"profile\": {\"bundles\": [\"@deepseek-ai/dsh-base\", \"marisa-bundle\", \"my-user-plugin\"]}}\n}\n")
	newPkg := filepath.Join(dstDsh, "profiles", "marisa", "package.json")
	writeTestFile(t, newPkg,
		"{\n  \"name\": \"marisa-marisa\",\n  \"version\": \"0.1.0\",\n  \"dependencies\": {\"dsh-new-plugin\": \"file:../../../plugins/dsh-new-plugin\", \"dsh-another-new\": \"file:../../../plugins/dsh-another-new\"},\n  \"dsh\": {\"profile\": {\"bundles\": [\"@deepseek-ai/dsh-base\", \"@deepseek-ai/dsh-web-app\", \"marisa-bundle\", \"dsh-new-plugin\"]}}\n}\n")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(newPkg)
	if err != nil {
		t.Fatal(err)
	}
	s := string(data)
	// 发行版行全部生效。
	for _, want := range []string{`"version": "0.1.0"`, "dsh-another-new", "@deepseek-ai/dsh-web-app", "dsh-new-plugin"} {
		if !containsStr(s, want) {
			t.Fatalf("merged manifest missing %q, got: %s", want, s)
		}
	}
	// 用户额外依赖保留（file: 指向存在的插件目录）。
	if !containsStr(s, "my-user-plugin") {
		t.Fatalf("user dependency lost after merge, got: %s", s)
	}
	// bundles 以新为准：用户 bundle 行不残留（其依赖仍在，可重新挂载）。
	bundlesIdx := indexOf(s, `"bundles"`)
	if bundlesIdx == -1 {
		t.Fatalf("bundles array missing: %s", s)
	}
	if indexOf(s[bundlesIdx:], "my-user-plugin") != -1 {
		t.Fatalf("stale user bundle row must not stay in bundles (release-owned list), got: %s", s)
	}
}

func TestMergeDshDataSkipsJunction(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	// junction 内容不得泄露进新树，也不得留下链接。
	if isJunction(filepath.Join(dstDsh, "profiles", "marisa", "node_modules")) {
		t.Fatal("junction must not be recreated by merge")
	}
	if _, err := os.Stat(filepath.Join(dstDsh, "profiles", "marisa", "node_modules", "marker.txt")); err == nil {
		t.Fatal("junction target content must not leak into migrated tree")
	}
}

func TestMergeDshDataSkipsWebProfile(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	// web 模板保持 bundle 版。
	if data, err := os.ReadFile(filepath.Join(dstDsh, "profiles", "web", "package.json")); err != nil || string(data) != `{"name":"web-new"}` {
		t.Fatalf("web profile must stay bundle-owned: %q err=%v", data, err)
	}
}

func TestMergeDshDataBrokenPackageJSONUsesBundle(t *testing.T) {
	// 0 字节 package.json（v0.1.10 事故现场形态）→ 必须让位给 bundle 版。
	srcDsh, dstDsh := newMergeFixture(t)
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "package.json"), "")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dstDsh, "profiles", "marisa", "package.json")); err != nil {
		t.Fatal(err)
	} else if !containsStr(string(data), `"version": "0.1.0"`) {
		t.Fatalf("broken package.json must fall back to bundle copy, got: %q", data)
	}
}

func TestMergeDshDataInvalidPackageJSONUsesBundle(t *testing.T) {
	// 非法 JSON 的 package.json 同样让位（boot 的 JSON.parse 会炸）。
	srcDsh, dstDsh := newMergeFixture(t)
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "package.json"), "{not json at all")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dstDsh, "profiles", "marisa", "package.json")); err != nil {
		t.Fatal(err)
	} else if !containsStr(string(data), `"version": "0.1.0"`) {
		t.Fatalf("invalid package.json must fall back to bundle copy, got: %q", data)
	}
}

func TestMergeDshDataBundledYmlAlwaysNew(t *testing.T) {
	srcDsh, dstDsh := newMergeFixture(t)
	// 旧 overlay 内容不同（模拟旧版部署配置）→ 不被迁移。
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "desktop.overlay.yml"), "- id: old-webserver\n")
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "standalone.overlay.yml"), "- id: old\n")
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "pnpm-workspace.yaml"), "packages: ['old']\n")
	writeTestFile(t, filepath.Join(srcDsh, "profiles", "marisa", "cordis.yml"), "[old]\n")
	if err := mergeDshData(srcDsh, dstDsh); err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{"desktop.overlay.yml", "standalone.overlay.yml", "pnpm-workspace.yaml", "cordis.yml"} {
		if data, err := os.ReadFile(filepath.Join(dstDsh, "profiles", "marisa", rel)); err != nil {
			t.Fatal(err)
		} else if containsStr(string(data), "old") {
			t.Fatalf("bundled yml %s must stay bundle-owned, got: %q", rel, data)
		}
	}
}

func TestMergeDshDataMissingSrcDsh(t *testing.T) {
	// 旧 .dsh 不存在：空操作成功（升级流程对无数据部署也走此路径）。
	dstDsh := filepath.Join(t.TempDir(), ".dsh")
	if err := os.MkdirAll(dstDsh, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := mergeDshData(filepath.Join(t.TempDir(), "nope"), dstDsh); err != nil {
		t.Fatalf("missing src must be a no-op, got %v", err)
	}
}

func containsStr(s, sub string) bool {
	return indexOf(s, sub) != -1
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
