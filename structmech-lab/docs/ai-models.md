# AI 模型配置

核验日期：2026-10-07。应用使用各厂商的官方中国区接口，升级时保持原厂商和已保存的 API Key。

| 厂商 | 助教模型 | 图片识别模型 | 官方资料 |
| --- | --- | --- | --- |
| DeepSeek | V4.1 Flash：`deepseek-flash` | `deepseek-flash` | [视觉输入](https://api-docs.deepseek.com/guides/vision/)、[更新记录](https://api-docs.deepseek.com/updates/) |
| 千问 | `qwen3.8-max` | `qwen3.8-max` | [Qwen3.8 Max](https://help.aliyun.com/zh/model-studio/qwen3-8-max) |
| 智谱 | `glm-5.3` | `glm-5.3-flash` | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)、[GLM-5.3 Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) |
| Kimi | `kimi-k3` | `kimi-k3` | [K3 快速开始](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)、[API 参数](https://platform.kimi.com/docs/api/chat) |
| 豆包 | `doubao-seed-2-1-pro-260915` | `doubao-seed-2-1-pro-260915` | [模型目录](https://docs.volcengine.com/docs/ark/model-list?redirect=1&lang=zh)、[结构化输出示例](https://docs.volcengine.com/docs/ark/structured-output-beta?lang=zh) |

## 调用参数

- DeepSeek 和豆包关闭可选推理；千问使用顶层 `enable_thinking: false`。
- GLM-5.3 和 GLM-5.3 Flash 始终推理，使用 `thinking.type: enabled`、`reasoning_effort: low` 和推荐的 `temperature: 1`。
- Kimi K3 始终推理，使用顶层 `reasoning_effort: low` 和 `max_completion_tokens`，不发送不支持的 `thinking` 和 `temperature`。
- 始终推理的模型在原输出预算上增加 8192 tokens，供推理与最终回答共同使用。如果输出被截断，界面提示重试，不将残缺内容作为成功结果。
- 助教多轮对话保留同一模型返回的 `reasoning_content`，界面仅展示最终回答。结构识别仅解析 `content`，不会将推理文字当作结构 JSON。

## 旧设置兼容

文字模型保留原来的五个厂商标识。视觉模型旧标识 `kimi-k2.5`、`qwen-vl-max`、`glm-4v-flash` 分别映射为 Kimi、千问、智谱，保存设置时写入稳定厂商标识。已有视觉 Key 但缺少模型标识时，沿用旧版本默认的 Kimi；新用户默认使用 DeepSeek。

视觉 Key 可以独立配置。留空时，只有助教和视觉属于同一厂商才复用助教 Key。模型迁移不修改已保存的 Key。未知模型标识会要求重新选择，不会自动将凭据发送给其他厂商。

设置中的“测试图片识别”发送应用内置的 32×32 红色方块，检查模型是否正确识别红色；不发送用户上传的结构图。“连接成功”要求模型返回最终回答，不能仅凭 HTTP 200 判断。

## 验证边界

自动化测试使用模拟 API 响应，验证请求参数、迁移、凭据复用和流式解析。真实服务可用性及账号模型权限，以设置中的实际连接测试为准。
