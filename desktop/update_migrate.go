// 升级数据迁移：把旧 backend\.dsh 的用户数据合并进新解压的 staging\.dsh。
//
// 背景（2026-08-25 v0.1.10 事故）：升级流程此前只做「备份 → 整树替换」，
// 用户数据（会话/设置）不会自动回到新 backend，需手动从备份复制；手动恢复
// 还会带回损坏的 profile 文件（0 字节 package.json 使 marisa profile 无法
// 启动，桌面壳降级到无插件的最小模式）。本文件让升级自动保留用户数据：
// 在 RemoveAll 旧 backend 之前，把旧 .dsh 合并进 staging 的 .dsh。
//
// 合并规则（用户数据优先，损坏的部署物让位给新 bundle）：
//   - junction 一律跳过：新部署由 LINKS.json 重放重建
//   - profiles/web（minimal 兜底模板）不迁移：以新 bundle 为准
//   - profiles/marisa 是「bundle 自带 + 用户可改」混合区：
//       package.json —— 发行版组合与用户自定义的合并载体：bundles 列表
//                      以新版本为准（profile 随发行版更新，被移除的旧行
//                      不残留——残留会让 boot 挂载失败）；dependencies
//                      保留用户额外行（file: 指向存在路径的插件），丢弃
//                      旧发行残留行；旧文件损坏（0 字节/非法 JSON）则
//                      整体用 bundle 新文件
//       bundle 自带 yml（desktop/standalone.overlay.yml、pnpm-workspace.yaml、
//       cordis.yml）—— 总是用新的（部署配置随发行版走）
//       其他文件（cordis.patch.yml 等用户新增）—— 保留旧的
//   - 其余一切（sessions/、storages/、settings.yaml、顶层文件、未知
//     profiles/*）以旧为准：目标缺失则复制，目标存在则覆盖为旧内容
//
// 失败安全：mergeDshData 返回错误时调用方保留旧 backend（不删、不切换），
// 下次启动重试；备份区（backup\dsh-*）始终先于迁移完成，作为安全网。
package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// bundledProfileAlwaysNew 是 profiles/marisa 下随发行版走的部署配置：
// 旧版本的一律不迁移（以新 bundle 为准）。package.json 不在其中——
// 它是「发行版组合 + 用户插件」的合并载体（见 mergeProfileManifest）。
var bundledProfileAlwaysNew = map[string]bool{
	"desktop.overlay.yml":    true,
	"standalone.overlay.yml": true,
	"pnpm-workspace.yaml":    true,
	"cordis.yml":             true,
}

// mergeDshData 把 srcDsh（旧 .dsh）的用户数据合并进 dstDsh（新 staging 的
// .dsh）。dstDsh 必须已存在（bundle 自带 .dsh 部署物已解压）。规则见文件头。
func mergeDshData(srcDsh, dstDsh string) error {
	if _, err := os.Stat(srcDsh); err != nil {
		if os.IsNotExist(err) {
			return nil // 旧 .dsh 不存在：无数据可迁
		}
		return err
	}
	profileWebPrefix := "profiles" + string(filepath.Separator) + "web"
	profileMarisaPrefix := "profiles" + string(filepath.Separator) + "marisa"
	return filepath.WalkDir(srcDsh, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == srcDsh {
			return nil
		}
		rel, err := filepath.Rel(srcDsh, path)
		if err != nil {
			return err
		}
		// junction 是部署共享链接，不迁移（新部署重建）。
		if isJunction(path) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		// profiles/web 是 minimal 兜底模板，以新 bundle 为准。
		if strings.HasPrefix(rel, profileWebPrefix) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		target := filepath.Join(dstDsh, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if strings.HasPrefix(rel, profileMarisaPrefix) {
			// bundle 自带部署配置：总是用新的（旧的不迁）。
			if bundledProfileAlwaysNew[filepath.Base(rel)] {
				if _, statErr := os.Stat(target); statErr == nil {
					return nil
				}
				// 新 bundle 里没有（罕见）：保留旧的。
				return copyDshFile(path, target, d)
			}
			// package.json：发行版行跟随新版本，用户行（dsh plugin add 的
			// 额外依赖/bundles）合并保留；旧清单损坏则整体用 bundle 版。
			if filepath.Base(rel) == "package.json" {
				if _, statErr := os.Stat(target); statErr == nil {
					merged, mergeErr := mergeProfileManifest(path, target)
					if mergeErr != nil {
						return nil // 旧清单损坏：用 bundle 的
					}
					return os.WriteFile(target, merged, 0o644)
				}
				return copyDshFile(path, target, d)
			}
		}
		return copyDshFile(path, target, d)
	})
}

// mergeProfileManifest 合并旧/新两份 profile package.json：
//   - dsh.profile.bundles：**以新版本为准**（发行组合行跟随发行版；旧发行
//     行可能在新版被移除——如 dsh-llm-fallbacks，残留会让 boot 挂载失败，
//     因此绝不追加旧行）；
//   - dependencies：同 key 以新版本为准；旧版本独有的 key 按值类型过滤后
//     保留——file: 指向存在的目录（用户 dsh plugin add 的插件）保留，
//     workspace:*（发行核心包行）与 file: 指向不存在路径（被移除的旧发行
//     插件）丢弃；
//   - 其余字段（dsh.desktop、name、version 等）以新版本为准。
//
// 返回合并后的 JSON（2 空格缩进 + 换行）。oldPath 损坏（读失败/非法 JSON）
// 时返回错误，调用方回退到纯新版本。
func mergeProfileManifest(oldPath, newPath string) ([]byte, error) {
	oldData, err := os.ReadFile(oldPath)
	if err != nil {
		return nil, err
	}
	newData, err := os.ReadFile(newPath)
	if err != nil {
		return nil, err
	}
	var oldM, newM map[string]any
	if err := json.Unmarshal(oldData, &oldM); err != nil {
		return nil, fmt.Errorf("old manifest invalid: %w", err)
	}
	if err := json.Unmarshal(newData, &newM); err != nil {
		return nil, fmt.Errorf("bundle manifest invalid: %w", err)
	}
	// 深拷贝新版本作为基底（bundles 与其余字段天然以新为准）。
	outBytes, err := json.Marshal(newM)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(outBytes, &out); err != nil {
		return nil, err
	}

	// dependencies：旧版本独有的 key 按值过滤后保留。
	oldDeps, _ := oldM["dependencies"].(map[string]any)
	if len(oldDeps) > 0 {
		outDeps, _ := out["dependencies"].(map[string]any)
		if outDeps == nil {
			outDeps = map[string]any{}
			out["dependencies"] = outDeps
		}
		newDeps, _ := newM["dependencies"].(map[string]any)
		// 相对 file: 值从 profile 目录解析（迁移前后位置不变：都是
		// .dsh/profiles/marisa，file:../../../ 依旧指向 backend 根）。
		profileDir := filepath.Dir(newPath)
		for key, value := range oldDeps {
			if _, exists := newDeps[key]; exists {
				continue // 同 key 以新版本为准
			}
			spec, ok := value.(string)
			if !ok {
				continue // 非字符串 spec：不保留
			}
			if strings.HasPrefix(spec, "workspace:") {
				continue // 发行核心包行：跟随新版 workspace
			}
			if strings.HasPrefix(spec, "file:") {
				p := strings.TrimPrefix(spec, "file:")
				if !filepath.IsAbs(p) {
					p = filepath.Join(profileDir, p)
				}
				if _, err := os.Stat(p); err != nil {
					continue // 指向不存在的目录：被移除的旧发行插件
				}
			}
			outDeps[key] = value // 用户额外依赖
		}
	}
	outBytes, err = json.MarshalIndent(out, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(outBytes, '\n'), nil
}

// copyDshFile 复制单个 .dsh 文件（保留原权限位）。
func copyDshFile(src, dst string, d fs.DirEntry) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	info, err := d.Info()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, info.Mode())
}
