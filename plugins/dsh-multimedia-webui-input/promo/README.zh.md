# 宣传录制

简体中文 | [English](README.md)

这个目录只包含录屏与 QA 工作流，不会给插件增加自动演示模式、展台接管、公开
链接或生产依赖。

`record.mjs` 驱动一个真实、隔离的 DSH 会话：分别选择一个独立文件和一个含三个
文件的文件夹，发送后等待真实模型读取全部四个文件，再让模型只对复制到工作区的
文件夹附件执行 `StrReplace` 并回读验证。最后展示当前会话清理的二次确认，以及
当前工作区附件的实际清理。执行后原始 fixture 保持不变。

输入路径和 Playwright 运行时都通过环境变量传入，私有仓库 URL、API key、用户名
和机器路径不会写进仓库。`setup-isolated.mjs` 与 `cleanup-isolated.mjs` 负责创建和
删除带所有权标记的临时 DSH home/workspace；清理脚本会拒绝专用临时前缀之外的路径。

生成的验收素材：

- `assets/dsh-multimedia-webui-input-demo.mp4`：H.264/YUV420p，1440×900，完整流程；
- `assets/dsh-multimedia-webui-input-demo.gif`：960×600、加速的 10 fps 预览。

素材展示的是真实发送、模型读写与验证、所有权范围内的清理，不是 mock，也不是
产品中的后台回放功能。
