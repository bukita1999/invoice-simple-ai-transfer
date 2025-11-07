# PDF 智能解析助手

使用 Vue + TypeScript + Vite 构建的单页工具，支持：

- 拖拽或选择 PDF 文件并提取文字
- 将提取内容提交给 OpenAI ChatGPT，生成 8 字以内总结和价格
- 在浏览器端重命名 PDF 并下载

## 快速开始

1. 复制 `.env.example` 为 `.env`，填入你的 `VITE_OPENAI_API_KEY`、`VITE_OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`）和 `VITE_OPENAI_MODEL`。
2. 安装依赖并启动：

   ```bash
   npm install
   npm run dev
   ```

3. 启动后访问 `http://localhost:5173`。

## 使用说明

1. 在页面中拖入或上传 PDF 文件，等待解析完成。
2. 点击「生成总结与价格」，工具会使用 `.env` 中的 API Key、Base URL 与模型向 ChatGPT 发起请求。
3. 解析成功后，系统会自动把重命名建议更新为「总结 - 价格」的格式，你可以直接点击按钮生成文件，也可以手动调整再下载。

> **提示**：浏览器无法直接覆盖原文件，重命名功能会返回一个新的下载链接，文件内容保持不变但文件名更新。
