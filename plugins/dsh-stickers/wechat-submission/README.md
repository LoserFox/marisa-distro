# 微信表情开放平台投稿素材

`upload/` 是实际上传目录，`source/` 保存封面与横幅的生成源图，`metadata.csv` 是投稿时可照填的文案草案。

## 上传顺序

1. 在微信表情开放平台创建“表情专辑”。
2. 上传 `upload/stickers/` 中的 24 张静态 PNG。
3. 上传 `upload/detail-banner.jpg`、`upload/cover.png` 和 `upload/chat-icon.png`。
4. 首次完善艺术家资料时，可先用 `upload/artist-avatar.png` 和 `upload/artist-banner.jpg`；若希望展示真人或团队品牌，请替换它们。
5. 参考 `metadata.csv` 填写专辑信息、含义词和标签，手机扫码预览后提交。

## 版权与审核前检查

- 投稿人必须拥有鲸鱼娘、DeepSeek/DSH 名称、Logo、官方贴纸及衍生形象的投稿和再发行权；请在拿到授权后填写版权信息。
- 未获得官方授权前，不要在名称、介绍或作者信息中使用“官方”“正版”“认证”等表述。
- `11-self-destruct` 的投稿版已把“自杀频率”改成“重启频率”，插件原图没有被修改。
- `10-no-thanks` 直接包含 `DeepSeek` 品牌名，建议在授权材料中明确覆盖该张；否则应在投稿前替换。
- 官方会在上传时自动压缩或裁剪超限素材，但本目录已经按当前规格预处理；详情见 `validation.json`。

## 重新生成

在仓库根目录运行：

```bash
npm run assets:wechat
```

生成脚本只读取 `assets/stickers/` 和 `wechat-submission/source/`，不会修改插件运行素材。
