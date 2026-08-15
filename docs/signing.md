# 代码签名提案

当前 Windows 和 macOS 产物未签名。Release 与 README 必须明确提示未知发布者、SmartScreen 和 Gatekeeper 风险，并提供 SHA256。

未来取得证书后：

1. 证书和密码只存放在 GitHub Environment Secrets。
2. 先签 Windows EXE，再签 MSI；上传前验证 Authenticode 状态。
3. macOS 使用 Developer ID 签名并完成 notarization 后，才可删除实验性未签名警告。
4. CI 日志不得输出证书内容、密码或临时密钥链。

本文件只是提案；当前 workflow 不实现伪签名、自签名或安全绕过脚本。
