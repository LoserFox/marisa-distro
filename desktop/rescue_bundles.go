// 急救页的插件级禁用：列出 profile 的 bundle 加载清单，允许把单个 bundle
// 从 dsh.profile.bundles 中临时移除（仅跳过加载，不卸载文件），并记录到
// profile 内的 .disabled-bundles.json 以便重新启用。每次变更先开安装事务
// WAL（保护 package.json），变更可回滚。禁用/启用均需重启后端生效。
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// marisaProfileName 是急救模式操作的 profile（与 launcher 默认一致）。
const marisaProfileName = "marisa"

// disabledBundlesFile 记录被禁用的 bundle 名（profile 内，WAL 不保护它，
// 重解包/初始化配置会清掉——回到出厂即全部启用）。
const disabledBundlesFile = ".disabled-bundles.json"

// bundleNamePattern 限定 bundle 包名（npm 命名 + scoped），防路径注入。
var bundleNamePattern = regexp.MustCompile(`^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$`)

// rescueProfileDir 返回急救模式操作的 profile 目录（backend 树内）。
func rescueProfileDir() (string, error) {
	backend, err := rescueBackendDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(backend, ".dsh", "profiles", marisaProfileName), nil
}

// profilePackageJSON 是 profile 的加载清单文件路径。
func profilePackageJSON(profileDir string) string {
	return filepath.Join(profileDir, "package.json")
}

// rescueBundle 是页面展示的一个 bundle 条目。
type rescueBundle struct {
	Name     string `json:"name"`
	Disabled bool   `json:"disabled"`
}

// profileManifest 是 profile package.json 的 dsh 切片（只读需要的最小面）。
type profileManifest struct {
	Dsh struct {
		Profile struct {
			Bundles []string `json:"bundles"`
		} `json:"profile"`
	} `json:"dsh"`
}

// bundleRepo 是插件管理的数据访问（目录可注入，测试用临时目录）。
type bundleRepo struct {
	profileDir string
	storeDir   string // WAL 状态目录
}

// newBundleRepo 组装生产实例。
func newBundleRepo() (bundleRepo, error) {
	profileDir, err := rescueProfileDir()
	if err != nil {
		return bundleRepo{}, err
	}
	store, err := newWalStore()
	if err != nil {
		return bundleRepo{}, err
	}
	return bundleRepo{profileDir: profileDir, storeDir: store.dir}, nil
}

// list 返回 bundle 清单（当前加载顺序 + 禁用标记）。
func (r bundleRepo) list() ([]rescueBundle, error) {
	bundles, err := r.readProfileBundles()
	if err != nil {
		return nil, err
	}
	disabled, err := r.readDisabledBundles()
	if err != nil {
		return nil, err
	}
	disabledSet := make(map[string]bool, len(disabled))
	for _, name := range disabled {
		disabledSet[name] = true
	}
	out := make([]rescueBundle, 0, len(bundles))
	for _, name := range bundles {
		out = append(out, rescueBundle{Name: name, Disabled: disabledSet[name]})
	}
	return out, nil
}

// setDisabled 在 WAL 保护下改 profile 清单：禁用（移除 bundle）或启用
// （把 bundle 加回清单末尾），并同步 .disabled-bundles.json。
func (r bundleRepo) setDisabled(name string, disable bool) error {
	if !bundleNamePattern.MatchString(name) || strings.Contains(name, "..") {
		return fmt.Errorf("无效的 bundle 名: %q", name)
	}
	bundles, err := r.readProfileBundles()
	if err != nil {
		return err
	}
	disabled, err := r.readDisabledBundles()
	if err != nil {
		return err
	}
	disabledSet := make(map[string]bool, len(disabled))
	for _, n := range disabled {
		disabledSet[n] = true
	}
	if disable {
		if disabledSet[name] {
			return fmt.Errorf("bundle %q 已禁用", name)
		}
		if !contains(bundles, name) {
			return fmt.Errorf("bundle %q 不在加载清单中", name)
		}
	} else if !disabledSet[name] {
		return fmt.Errorf("bundle %q 未处于禁用状态", name)
	}

	// 变更先开 WAL 事务（保护 package.json）。
	store := newWalStoreAt(r.storeDir)
	tx, err := store.begin(walBeginInput{
		ProfileDir:     r.profileDir,
		ProfileName:    marisaProfileName,
		PackageName:    "rescue-bundle-" + name,
		PackageVersion: map[bool]string{true: "disable", false: "enable"}[disable],
		ProtectedFiles: []string{profilePackageJSON(r.profileDir)},
	})
	if err != nil {
		return err
	}

	apply := func() error {
		if disable {
			bundles = removeStr(bundles, name)
			disabled = append(disabled, name)
		} else {
			// bundles 可能已含该名字（WAL 回滚恢复后），避免重复。
			if !contains(bundles, name) {
				bundles = append(bundles, name)
			}
			disabled = removeStr(disabled, name)
		}
		if err := r.writeProfileBundles(bundles); err != nil {
			return err
		}
		return r.writeDisabledBundles(disabled)
	}
	if err := apply(); err != nil {
		if _, rbErr := store.rollback(tx.TransactionID, walFailRecovery); rbErr != nil {
			log.Printf("rescue: bundle 变更失败且 WAL 回滚失败: %v（原错误 %v）", rbErr, err)
		}
		return err
	}
	if _, err := store.seal(tx.TransactionID); err != nil {
		return err
	}
	action := "禁用"
	if !disable {
		action = "启用"
	}
	log.Printf("rescue: 已%s bundle %s（重启后生效，WAL tx=%s）", action, name, tx.TransactionID)
	return nil
}

// readProfileBundles 解析 profile 的加载清单；缺失/损坏返回错误。
func (r bundleRepo) readProfileBundles() ([]string, error) {
	data, err := os.ReadFile(profilePackageJSON(r.profileDir))
	if err != nil {
		return nil, fmt.Errorf("读取 profile 清单: %w", err)
	}
	var m profileManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("解析 profile 清单: %w", err)
	}
	return m.Dsh.Profile.Bundles, nil
}

// readDisabledBundles 读取禁用清单；缺失按空处理。
func (r bundleRepo) readDisabledBundles() ([]string, error) {
	data, err := os.ReadFile(filepath.Join(r.profileDir, disabledBundlesFile))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var names []string
	if err := json.Unmarshal(data, &names); err != nil {
		return nil, err
	}
	return names, nil
}

// writeDisabledBundles 原子写禁用清单。
func (r bundleRepo) writeDisabledBundles(names []string) error {
	data, err := json.MarshalIndent(names, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(r.profileDir, disabledBundlesFile)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// writeProfileBundles 写回 profile 清单（只改 dsh.profile.bundles，其余字段
// 原样保留；map 解析避免 struct 丢失 name/dependencies 等字段）。
func (r bundleRepo) writeProfileBundles(bundles []string) error {
	path := profilePackageJSON(r.profileDir)
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return err
	}
	dsh, _ := root["dsh"].(map[string]any)
	if dsh == nil {
		return errors.New("profile 清单缺少 dsh 段")
	}
	profile, _ := dsh["profile"].(map[string]any)
	if profile == nil {
		return errors.New("profile 清单缺少 dsh.profile 段")
	}
	profile["bundles"] = bundles
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// contains 报告切片是否含目标。
func contains(items []string, target string) bool {
	for _, it := range items {
		if it == target {
			return true
		}
	}
	return false
}

// removeStr 返回移除所有匹配项后的新切片。
func removeStr(items []string, target string) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		if it != target {
			out = append(out, it)
		}
	}
	return out
}
