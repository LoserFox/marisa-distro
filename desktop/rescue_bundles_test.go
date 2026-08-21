// 急救页插件管理的矩阵单测：清单解析、禁用/启用、WAL 保护、字段保留、
// 非法名拒绝、回滚一致性。
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// bundleFixture 建临时 profile（含完整 package.json 字段）与 WAL 状态目录。
type bundleFixture struct {
	repo      bundleRepo
	profile   string
	pkgJSON   string
	stateDir  string
	origBundles []string
}

func newBundleFixture(t *testing.T) *bundleFixture {
	t.Helper()
	root := t.TempDir()
	profile := filepath.Join(root, "profile")
	stateDir := filepath.Join(root, "state")
	if err := os.MkdirAll(profile, 0o755); err != nil {
		t.Fatal(err)
	}
	f := &bundleFixture{
		repo:     bundleRepo{profileDir: profile, storeDir: stateDir},
		profile:  profile,
		pkgJSON:  filepath.Join(profile, "package.json"),
		stateDir: stateDir,
		origBundles: []string{
			"@deepseek-ai/dsh-base",
			"@deepseek-ai/dsh-web-app",
			"marisa-bundle",
			"dsh-better-sidebar",
		},
	}
	f.writeManifest(t, f.origBundles)
	return f
}

func (f *bundleFixture) writeManifest(t *testing.T, bundles []string) {
	t.Helper()
	doc := map[string]any{
		"name":         "marisa-marisa",
		"private":      true,
		"version":      "0.1.0",
		"dependencies": map[string]any{"dsh-better-sidebar": "file:../../../plugins/dsh-better-sidebar"},
		"dsh": map[string]any{
			"profile": map[string]any{"bundles": bundles},
		},
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(f.pkgJSON, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func (f *bundleFixture) readBundles(t *testing.T) []string {
	t.Helper()
	bundles, err := f.repo.readProfileBundles()
	if err != nil {
		t.Fatal(err)
	}
	return bundles
}

// list 正确反映加载顺序与禁用标记。
func TestBundleList(t *testing.T) {
	f := newBundleFixture(t)
	list, err := f.repo.list()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 4 {
		t.Fatalf("list len = %d, want 4", len(list))
	}
	for i, want := range f.origBundles {
		if list[i].Name != want || list[i].Disabled {
			t.Fatalf("list[%d] = %+v, want %s enabled", i, list[i], want)
		}
	}
}

// 禁用：bundle 从清单移除 + 禁用清单记录 + WAL 事务封存 + 其它字段保留。
func TestBundleDisable(t *testing.T) {
	f := newBundleFixture(t)
	if err := f.repo.setDisabled("dsh-better-sidebar", true); err != nil {
		t.Fatal(err)
	}
	bundles := f.readBundles(t)
	if contains(bundles, "dsh-better-sidebar") {
		t.Fatalf("bundle still in bundles: %v", bundles)
	}
	if len(bundles) != 3 {
		t.Fatalf("bundles len = %d, want 3", len(bundles))
	}
	disabled, err := f.repo.readDisabledBundles()
	if err != nil {
		t.Fatal(err)
	}
	if !contains(disabled, "dsh-better-sidebar") {
		t.Fatalf("disabled list missing bundle: %v", disabled)
	}
	// WAL 事务已封存（awaiting-restart），package.json 受保护
	store := newWalStoreAt(f.stateDir)
	tx, err := store.read()
	if err != nil || tx == nil {
		t.Fatalf("wal tx missing: %v", err)
	}
	if tx.Phase != walAwaitingRestart {
		t.Fatalf("wal phase = %s, want awaiting-restart", tx.Phase)
	}
	if tx.PackageName != "rescue-bundle-dsh-better-sidebar" {
		t.Fatalf("wal package = %s", tx.PackageName)
	}
	// 非 bundles 字段保留
	data, err := os.ReadFile(f.pkgJSON)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	if doc["name"] != "marisa-marisa" || doc["dependencies"] == nil {
		t.Fatalf("manifest fields lost after disable: %s", string(data))
	}
	// list 反映禁用
	list, err := f.repo.list()
	if err != nil {
		t.Fatal(err)
	}
	for _, b := range list {
		if b.Name == "dsh-better-sidebar" {
			t.Fatalf("disabled bundle still listed: %+v", b)
		}
	}
}

// 重复禁用报错；禁用不在清单中的名字报错。
func TestBundleDisableGuards(t *testing.T) {
	f := newBundleFixture(t)
	if err := f.repo.setDisabled("dsh-better-sidebar", true); err != nil {
		t.Fatal(err)
	}
	if err := f.repo.setDisabled("dsh-better-sidebar", true); err == nil {
		t.Fatalf("double disable: expected error")
	}
	if err := f.repo.setDisabled("ghost-bundle", true); err == nil {
		t.Fatalf("disable unknown bundle: expected error")
	}
}

// verifyPendingTx 模拟一次重启：把挂起事务走 verifying → verified（清事务）。
func (f *bundleFixture) verifyPendingTx(t *testing.T) {
	t.Helper()
	store := newWalStoreAt(f.stateDir)
	tx, err := store.read()
	if err != nil || tx == nil {
		t.Fatalf("wal tx missing: %v", err)
	}
	if _, err := store.markVerifying(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.verify(tx.TransactionID); err != nil {
		t.Fatal(err)
	}
}

// 启用：bundle 加回清单末尾 + 禁用清单移除；未禁用时启用报错。
func TestBundleEnable(t *testing.T) {
	f := newBundleFixture(t)
	if err := f.repo.setDisabled("marisa-bundle", true); err != nil {
		t.Fatal(err)
	}
	f.verifyPendingTx(t) // 禁用后重启（清 WAL 事务），才能继续启用
	if err := f.repo.setDisabled("marisa-bundle", false); err != nil {
		t.Fatal(err)
	}
	bundles := f.readBundles(t)
	if !contains(bundles, "marisa-bundle") {
		t.Fatalf("bundle not restored: %v", bundles)
	}
	if bundles[len(bundles)-1] != "marisa-bundle" {
		t.Fatalf("bundle not appended at end: %v", bundles)
	}
	disabled, err := f.repo.readDisabledBundles()
	if err != nil {
		t.Fatal(err)
	}
	if contains(disabled, "marisa-bundle") {
		t.Fatalf("disabled list not cleaned: %v", disabled)
	}
	if err := f.repo.setDisabled("marisa-bundle", false); err == nil {
		t.Fatalf("enable not-disabled bundle: expected error")
	}
}

// WAL 回滚后 package.json 恢复（bundles 回来）；此时重新启用只清禁用清单，
// 不产生重复项。
func TestBundleRollbackConsistency(t *testing.T) {
	f := newBundleFixture(t)
	if err := f.repo.setDisabled("dsh-better-sidebar", true); err != nil {
		t.Fatal(err)
	}
	// 模拟用户回滚 WAL：package.json 恢复原状
	store := newWalStoreAt(f.stateDir)
	tx, err := store.read()
	if err != nil || tx == nil {
		t.Fatal(err)
	}
	if _, err := store.rollback(tx.TransactionID, walFailRecovery); err != nil {
		t.Fatal(err)
	}
	f.writeManifest(t, f.origBundles) // 回滚恢复原始 bundles
	// 启用：清禁用清单，bundles 不重复
	if err := f.repo.setDisabled("dsh-better-sidebar", false); err != nil {
		t.Fatal(err)
	}
	bundles := f.readBundles(t)
	count := 0
	for _, b := range bundles {
		if b == "dsh-better-sidebar" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("duplicate bundle after enable-rollback: %v", bundles)
	}
	disabled, err := f.repo.readDisabledBundles()
	if err != nil {
		t.Fatal(err)
	}
	if len(disabled) != 0 {
		t.Fatalf("disabled list not empty: %v", disabled)
	}
}

// 非法 bundle 名拒绝（路径注入/大写/空）。
func TestBundleNameValidation(t *testing.T) {
	f := newBundleFixture(t)
	for _, name := range []string{"../escape", "A/B", "", "a b", "a\\b"} {
		if err := f.repo.setDisabled(name, true); err == nil {
			t.Fatalf("invalid name %q: expected error", name)
		}
	}
	// 合法 scoped 名放行（不存在的名字报"不在加载清单"，而非"无效名"）
	err := f.repo.setDisabled("@r05en1cu/dsh-mygo", true)
	if err == nil || !strings.Contains(err.Error(), "不在加载清单") {
		t.Fatalf("valid scoped name should reach list check, got %v", err)
	}
}

// 清单缺失/损坏时 list 报错而不是崩溃。
func TestBundleMissingManifest(t *testing.T) {
	f := newBundleFixture(t)
	if err := os.Remove(f.pkgJSON); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.list(); err == nil {
		t.Fatalf("missing manifest: expected error")
	}
	if err := os.WriteFile(f.pkgJSON, []byte("{broken"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := f.repo.list(); err == nil {
		t.Fatalf("corrupt manifest: expected error")
	}
}
