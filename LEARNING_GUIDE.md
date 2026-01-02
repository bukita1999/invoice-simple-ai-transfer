# PDF 智能助手学习指南

本文档围绕当前的 Vite + Vue 3 + TypeScript 项目结构，挑选出了几个关键代码段进行解释，方便你从实践中理解：

## 1. 应用入口和路由

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';

createApp(App)
  .use(router) // 将 Vue Router 挂载到整个应用，router-view/RouterLink 才能正常工作
  .mount('#app'); // Vite 会在 index.html 中提供具有这个 id 的挂载目标
```

```ts
import { createRouter, createWebHistory } from 'vue-router';
import SingleAnalyzer from './pages/SingleAnalyzer.vue';
import BatchAnalyzer from './pages/BatchAnalyzer.vue';

export const router = createRouter({
  history: createWebHistory(), // HTML5 history 模式，避免 hash# 里带路径
  routes: [
    { path: '/', component: SingleAnalyzer },
    { path: '/batch', component: BatchAnalyzer }
  ]
});
```

以上体现了 Vite 中通过 ES 模块引入（`import … from …`）+ TypeScript 类型提示组合，`createRouter` 返回的 Router 实例在 `main.ts` 中 `.use(router)` 一次性注入到整个应用。

## 2. SingleAnalyzer：Composition API 与可响应数据

```ts
const droppedFile = ref<File | null>(null); // ref 可以保存基本类型+对象，并自动解包响应式值
const summary = ref('');
const price = ref('');
const processing = ref(false);

const fileName = computed(() => droppedFile.value?.name ?? '');
const envWarning = computed(() =>
  openAiConfig.key ? '' : '请在 .env 中配置 VITE_OPENAI_API_KEY'
);

watch([summary, price], () => {
  if (!processing.value && droppedFile.value) {
    renameInput.value = buildSummaryPriceName(
      summary.value,
      price.value,
      droppedFile.value.name
    );
  }
});
```

在 `script setup` 模式下，`ref`/`computed`/`watch` 是 Vue Composition API 的基石：`ref<T>` 让 TypeScript 识别 DOM 事件处理里会用到的类型，`computed` 缓存衍生状态，`watch([summary, price], …)` 监听多个依赖并在值变化后自动重建文件名。

```ts
const response = await fetch(normalizedChatUrl(), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${openAiConfig.key}`
  },
  body: JSON.stringify({
    model: openAiConfig.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '你是擅长提炼总结的 AI 助手。' },
      {
        role: 'user',
        content: `${prompt}\n\nPDF 文本：\n${pdfText.value.slice(0, 12000)}`
      }
    ]
  })
});
```

这一段的 TypeScript 写法体现了：

- `normalizedChatUrl()` 将配置的 `VITE_OPENAI_BASE_URL` 保证尾部没有 `/`，避免 `fetch` 报错；
- `openAiConfig.model` 等值来自 `src/utils/openai.ts`，重用配置；
- `fetch` 结果通过 `await response.json()` 再拿到 `choices[0].message.content`，TypeScript 事务在 `try/catch` 内保护 runtime 错误，并通过 `error.value` + 日志提示用户。

## 3. BatchAnalyzer：类型、异步、压缩包

```ts
type BatchItem = {
  id: number;
  file: File;
  text: string;
  ready: boolean;
  summary: string;
  price: string;
  newName: string;
};

const batchFiles = ref<BatchItem[]>([]);
let idCounter = 0;
```

在 TypeScript 中定义 `BatchItem` 后，`ref<BatchItem[]>` 会在模板里（如 `v-for="item in batchFiles"`）获得智能提示，`idCounter` 防止多个文件重名。接下来通过 `handleFiles` 逐个 `await extractPdfText` 来填充 `item.text`，然后再调用 `analyzeBatch`。

```ts
const payload = batchFiles.value.map((item, index) => ({
  index: index + 1,
  originalName: item.file.name,
  text: item.text.slice(0, 4000)
}));

const prompt = `你将收到多个 PDF 文本，请针对每个文件生成 8 个字以内总结与价格。返回 JSON 数组 …`;

const response = await fetch(normalizedChatUrl(), { … });

const data = await response.json();
const parsed = JSON.parse(content);

parsed.forEach((record, idx) => {
  const target =
    batchFiles.value.find((item) => item.file.name === record.originalName) ??
    batchFiles.value[idx];
  if (!target) return;
  target.summary = record.summary ?? '';
  target.price = record.price ?? '';
  target.newName = buildSummaryPriceName(
    target.summary,
    target.price,
    record.newName || target.file.name
  );
});
```

这里组合了：

- TypeScript `map` + `forEach` 的静态类型帮助确保 `payload` 是合法 JSON；
- `??` 是 nullish coalescing operator，避免 `undefined` 破坏结果；
- `buildSummaryPriceName` 重新组合 summary+price，并调用 `ensurePdfExtension` 保证 `.pdf` 扩展名；
- `downloadZip` 使用 `JSZip` + `URL.createObjectURL` 生成并触发浏览器下载，演示客户端如何处理二进制资源。

## 4. 工具函数（OpenAI 配置、文件名安全）

```ts
export type OpenAiConfig = { key: string; baseUrl: string; model: string };

const defaultApiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? '';
const defaultBaseUrl = ...

export const openAiConfig: OpenAiConfig = {
  key: defaultApiKey,
  baseUrl: defaultBaseUrl || 'https://api.openai.com/v1',
  model: defaultModel || 'gpt-4o-mini'
};

export function normalizedChatUrl() {
  return openAiConfig.baseUrl.replace(/\/$/, '') + '/chat/completions';
}
```

注意 `import.meta.env` 是 Vite 特有的全局对象，用来读取 `.env` 中的变量；Vite 会在编译阶段把它们替换成静态字符串，所以 TypeScript 可以在编译时推导类型。

```ts
export function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export function ensurePdfExtension(name: string) {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

export function buildSummaryPriceName(summary?: string, price?: string, fallback = '文档') {
  const parts = [summary, price].filter(Boolean);
  const base = parts.length ? parts.join(' - ') : fallback;
  const safeBase = sanitizeFileName(base || fallback) || '文档';
  return ensurePdfExtension(safeBase);
}
```

这些纯函数通过显式的参数 `summary?: string` 展示 TypeScript 的可选参数，同时 `filter(Boolean)` 会移除空字符串，链式调用 `sanitize` + `ensurePdfExtension` 保证文件名既安全又有 `.pdf` 后缀。

## 5. 额外的技术点

- `GlobalWorkerOptions.workerSrc = new URL(..., import.meta.url).toString();`：用了 `import.meta.url` + `new URL` 配合 Vite 的资源处理来获取 pdf.js worker 的绝对地址；
- `URL.createObjectURL`/`URL.revokeObjectURL`：在当前 tab 生成临时下载链接后必须释放，防止内存泄露；
- `watch` 和 `computed` 相互配合，避免用户手动刷新历史记录；
- `.slice(0, 12000)` 说明前端要控制请求 payload 大小，否则 OpenAI 请求会因为过长文本被拒。

继续在这份项目基础上练习：阅读每个 `template` 中的指令（`v-if`, `v-for`, `@click`, `:class` 绑定等），搭配上面解释的 script 代码，会帮助你全面掌握 Vue + Vite + TypeScript 的开发流程。
