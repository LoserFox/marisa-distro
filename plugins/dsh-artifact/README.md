# dsh-artifact

dsh 的文件交付协议。模型写完文件 ≠ 用户拿到文件——本插件补上这最后一步。

注册一个 `send_artifact(path, caption?)` 工具：模型产出文件后调用它正式交付。插件校验文件、构造结构化描述子，随 `tool/result` 事件的 `meta` 字段进入 dsh 标准事件流——**任何消费 `events.mux` 的客户端**都能拿到并按自己的方式呈现：桌面壳弹预览卡片、IM 桥直接转发文件、headless 客户端记录路径。不引入任何自定义传输通道。

```
模型: （写完 report.md）→ send_artifact(path="/work/report.md", caption="周报")
     ← "Delivered report.md (markdown, 4096 bytes) to the user."
客户端: 在 tool/result 的 meta 里收到 ↓ 并渲染
```

## 描述子（meta 形状）

```json
{
  "kind": "artifact",
  "artifactKind": "markdown",
  "path": "/work/report.md",
  "name": "report.md",
  "mimeType": "text/markdown",
  "caption": "周报",
  "sizeBytes": 4096
}
```

`artifactKind`: `image | video | audio | pdf | markdown | html | text | other`（按扩展名分类，未知类型安全回退 `other`）。

同时注入一段 system prompt，教模型"产出文件后调用 send_artifact 交付；只写盘不交付用户看不到；终稿交付一次，不发中间产物"。

## 安装

**原生挂载（默认）**——dsh 主程序自带 `~/.dsh/config.yaml` 个人覆盖层，三步完成，不依赖任何第三方管理器：

```sh
# 1) 取码（放哪都行）
git clone https://github.com/dsh-external/dsh-artifact ~/dsh-plugins/dsh-artifact
# 2) 链接宿主依赖（pnpm 布局下必需，背景见 marisa#2）
CHECKOUT="$(cd "$(dirname "$(readlink -f "$(command -v dsh)")")/../../.." && pwd)"
mkdir -p ~/dsh-plugins/dsh-artifact/node_modules/@deepseek-ai
ln -sfn "$CHECKOUT/packages/core/tools" ~/dsh-plugins/dsh-artifact/node_modules/@deepseek-ai/dsh-tools
# 3) 挂载并重启 dsh
cat >> ~/.dsh/config.yaml <<EOF
- insert:
    - id: dsh-artifact
      name: '$HOME/dsh-plugins/dsh-artifact/lib/index.js'
EOF
```

用 [DSH Companion](https://github.com/dsh-external/dsh-companion) 的话零安装——已随应用自带。

<details>
<summary>可选：经插件管理器安装（Marisa / plugin-registry）</summary>

```sh
dshx install dsh-artifact https://github.com/dsh-external/dsh-artifact && dshx verify dsh-artifact
```

或 `dsh registry install ./dsh-artifact && dsh registry enable dsh-artifact`。注意 [marisa#2](https://github.com/dsh-external/marisa/issues/2) 修复前，装完仍需按上面第 2 步手工链接宿主依赖。

</details>

## 客户端接入指南

监听 mux 流的 `session/event`，事件 `type == "tool/result"` 且（经 `tool/call` 配对得到的）工具名为 `send_artifact` 时，`event.data.meta` 即上述描述子。`kind: "artifact"` 是判别字段。

## 开发

```sh
./scripts/build.sh                 # 用 dsh 检出的 tsc 编译（产物入库）
<dsh-checkout>/node_modules/.bin/vitest run --root .   # 4 个 spec：真实 Cordis 组合
```

## License

BSD-3-Clause
