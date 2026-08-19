# registry auth：profile .npmrc 受管块 + 官方 credentials 语义（rc8）

> 范围：mygo 接管 profile 级 registry 认证。`profile/{name}/.npmrc` 由
> mygo 受管块携带 registry 映射与 auth **引用**；机密值只存
> `$DSH_HOME/.credentials.yaml`，全部经官方 `ctx.credentials` 服务进出。
> 装私有源/hub 插件时 pnpm 自动带凭据；轮换机密不碰任何配置文件、无需
> 重启。实现：mygo 核心 `src/npmrc.ts` / `src/registry-auth.ts`，接入
> lifecycle（bundle rail spawn）、loader-profile face（pnpm spawn）、
> 面板 API/设置卡片、mygo-cli registry/auth 命令。

## 1. 核心语义（官方 credentials 语义，严格沿用）

- **配置只携带对机密的引用**：`.npmrc` 受管块内只写 `${REF}` 占位
  （POSIX 环境变量形状）；值在提供方 store。任何代码/日志/UI/API 响应
  不携带值；describe 只答 configured/source/writable。
- **按操作解析不缓存**：每次 spawn 前重新 `credentials.resolve(ref)`——
  轮换机密下一次安装即生效。
- **空值 = 不存在**：空串凭据视为未配置。
- **env 遮蔽拒绝写**：更高优先级来源（如进程环境变量）遮蔽时 set/unset
  拒绝（面板 409 + `writable:false`，CLI 报错），界面靠 writable 置灰。
- **不阻断 spawn**：引用未配置/服务缺席时照样安装（warnings 点名哪个
  ref 未配置）——pnpm 自己的 401 就是最清楚的报错。

## 2. 三层形态

```
管理面（面板「源与凭据」/ mygo registry、auth 命令）
  → profile/.npmrc 受管块（映射唯一真相源；只写 ${REF} 占位）
凭据层（面板 masked 输入 / mygo auth set）
  → ctx.credentials → $DSH_HOME/.credentials.yaml（提供方 0600/原子写）
消费点（install/uninstall/restore 的 pnpm/dsh spawn）
  → spawn 前 collectAuthRefs → credentials.resolve → 子进程 env
```

`.npmrc` 受管块形态：

```ini
# >>> mygo registry auth
@my-scope:registry=https://npm.example.com
//npm.example.com/:_authToken=${MY_SCOPE_TOKEN}
# <<< mygo registry auth
```

块外用户行逐字节不动；块内 mygo 受管（手写内容下次 upsert 被覆盖）。
删净后块与文件不留痕。`.npmrc` 的 `${VAR}` 展开是 pnpm 原生语义；
profile 目录即 pnpm 的 cwd，profile 级 .npmrc 自动生效。

## 3. 入口

- **面板**：设置区「源与凭据」标签页——映射列表（scope/URL/引用名/
  已配置徽标/遮蔽徽标）、添加/删除映射、masked 输入设/删凭据。
  API：`GET /api/mygo/registries`、`PUT|DELETE /api/mygo/registries/:scope`、
  `PUT|DELETE /api/mygo/credentials/:ref`（响应永不携带值）。
- **CLI**：`mygo registry list|add|remove`、`mygo auth status|set|unset`
  （set 经 `--value-env VAR` 或交互隐藏输入，不回显）。
- **降级**：credentials 服务缺席（非 web 组合）时映射管理照常（文件级），
  凭据设/删报「服务不可达」，spawn 透传 process.env + warn。

## 4. 与官方 Models 页密钥的关系

同一个 store：官方设置页（Models 等）管理的密钥与 mygo auth 命令读写
的都是 `$DSH_HOME/.credentials.yaml` 经同一 credentials 服务——ref 同名
即同一份值，两侧 describe/set/unset 语义一致（按操作解析、遮蔽拒绝、
空值即无）。mygo 只新增「.npmrc 引用 → spawn env」这座桥，不动提供方
实现，不自读 store 文件。
