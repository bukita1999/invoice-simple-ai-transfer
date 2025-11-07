<template>
  <main class="card">
    <header>
      <h1>PDF 智能解析助手</h1>
      <p>拖拽或上传 PDF，提取文字并让 ChatGPT 生成 8 字以内总结与价格，顺便重命名文件。</p>
    </header>

    <section class="panel">
      <h2>1. 上传 PDF</h2>
      <div
        class="drop-zone"
        :class="{ 'drop-zone--active': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <p v-if="!fileName">拖入 PDF 或点击下方按钮</p>
        <p v-else>已选择：{{ fileName }}</p>
        <input type="file" accept="application/pdf" @change="handleInput" />
      </div>
      <p v-if="pdfText" class="hint">解析成功，共 {{ charCount }} 个字符</p>
    </section>

    <section class="panel" v-if="pdfText">
      <h2>2. AI 解析</h2>
      <p class="hint">API Key、Base URL 与模型均来自 .env 配置。</p>
      <button class="primary" :disabled="!canAnalyze" @click="analyzeWithChatGPT">
        {{ processing ? '解析中...' : '生成总结与价格' }}
      </button>
      <p v-if="envWarning" class="error">{{ envWarning }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="summary || price" class="result">
        <p><strong>总结：</strong>{{ summary || '（暂无）' }}</p>
        <p><strong>价格：</strong>{{ price || '（暂无）' }}</p>
      </div>
    </section>

    <section class="panel" v-if="droppedFile">
      <h2>3. 重命名 PDF</h2>
      <label class="field">
        <span>新文件名</span>
        <input v-model.trim="renameInput" placeholder="例如：发票总结.pdf" />
      </label>
      <button @click="renamePdf" :disabled="!renameInput">生成重命名文件</button>
      <p v-if="renameMessage" class="hint">{{ renameMessage }}</p>
      <a
        v-if="renamedUrl"
        class="download"
        :href="renamedUrl"
        :download="renameInput"
      >下载重命名后的 PDF</a>
    </section>

    <section class="panel" v-if="pdfText">
      <details>
        <summary>查看提取的原始文本</summary>
        <pre>{{ pdfText }}</pre>
      </details>
    </section>

    <section class="panel" v-if="logEntries.length">
      <h2>操作日志</h2>
      <ul class="log-list">
        <li v-for="(entry, index) in logEntries" :key="index">{{ entry }}</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { openAiConfig, normalizedChatUrl } from '../utils/openai';
import { buildSummaryPriceName, ensurePdfExtension } from '../utils/fileName';

GlobalWorkerOptions.workerSrc = workerSrc;

const droppedFile = ref<File | null>(null);
const pdfText = ref('');
const summary = ref('');
const price = ref('');
const processing = ref(false);
const error = ref('');
const isDragging = ref(false);
const renameInput = ref('');
const renamedUrl = ref('');
const renameMessage = ref('');
const logEntries = ref<string[]>([]);

const fileName = computed(() => droppedFile.value?.name ?? '');
const charCount = computed(() => pdfText.value.length);
const envWarning = computed(() => (openAiConfig.key ? '' : '请在 .env 中配置 VITE_OPENAI_API_KEY'));
const canAnalyze = computed(() => !processing.value && Boolean(pdfText.value) && !envWarning.value);

watch([summary, price], () => {
  if (!processing.value && droppedFile.value) {
    renameInput.value = buildSummaryPriceName(summary.value, price.value, droppedFile.value.name);
  }
});

function pushLog(message: string) {
  const time = new Date().toLocaleTimeString();
  logEntries.value = [`[${time}] ${message}`, ...logEntries.value].slice(0, 200);
}

async function handleFiles(files: FileList | null) {
  if (!files || !files.length) return;
  const file = files[0];
  if (file.type !== 'application/pdf') {
    error.value = '请上传 PDF 文件。';
    pushLog('上传失败：非 PDF 文件');
    return;
  }
  error.value = '';
  summary.value = '';
  price.value = '';
  renameMessage.value = '';
  droppedFile.value = file;
  renameInput.value = file.name;
  pushLog(`开始解析文件：${file.name}`);
  await extractPdfText(file);
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  handleFiles(event.dataTransfer?.files ?? null);
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  handleFiles(target.files);
  target.value = '';
}

async function extractPdfText(file: File) {
  pdfText.value = '';
  try {
    const data = await file.arrayBuffer();
    const pdf = await getDocument({ data }).promise;
    let text = '';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ');
      text += `${strings}\n`;
    }
    pdfText.value = text.trim();
    await pdf.cleanup();
    pdf.destroy();
    pushLog(`提取完成：${file.name}，字符数 ${pdfText.value.length}`);
  } catch (err) {
    console.error(err);
    error.value = '读取 PDF 失败，请重试。';
    pushLog(`读取 PDF 失败：${(err as Error).message ?? err}`);
  }
}

async function analyzeWithChatGPT() {
  if (!openAiConfig.key) {
    error.value = '尚未在 .env 中配置 VITE_OPENAI_API_KEY。';
    return;
  }
  if (!pdfText.value) {
    error.value = '尚未解析到文本。';
    return;
  }
  processing.value = true;
  error.value = '';
  pushLog('开始调用 OpenAI API');

  const prompt = `你是文件解析助手。请根据以下 PDF 提取的原始文本，仅输出 JSON，格式为 {"summary":"8个字以内的总结","price":"价格数值或描述"}。`;

  try {
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
          { role: 'system', content: '你是擅长提炼总结和金额信息的 AI 助手。' },
          { role: 'user', content: `${prompt}\n\nPDF 文本：\n${pdfText.value.slice(0, 12000)}` }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 调用失败：${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('未获取到内容');
    }

    let parsed: { summary?: string; price?: string } | null = null;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed) {
      throw new Error('AI 没有返回有效的 JSON。');
    }

    summary.value = parsed.summary ?? '';
    price.value = parsed.price ?? '';
    renameInput.value = buildSummaryPriceName(summary.value, price.value, droppedFile.value?.name ?? '文档');
    pushLog(`AI 返回：summary="${summary.value}", price="${price.value}"`);
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : '解析失败';
    pushLog(`AI 调用失败：${(err as Error).message ?? err}`);
  } finally {
    processing.value = false;
    pushLog('OpenAI 调用结束');
  }
}

function renamePdf() {
  if (!droppedFile.value || !renameInput.value) {
    renameMessage.value = '请先上传文件并输入新名称。';
    return;
  }

  const safeName = ensurePdfExtension(renameInput.value);
  const renamedFile = new File([droppedFile.value], safeName, { type: droppedFile.value.type });

  if (renamedUrl.value) {
    URL.revokeObjectURL(renamedUrl.value);
  }
  renamedUrl.value = URL.createObjectURL(renamedFile);
  renameInput.value = safeName;
  renameMessage.value = `已生成 ${safeName}，点击下方链接即可下载。`;
  pushLog(`生成下载文件：${safeName}`);
}
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
}

header {
  margin-bottom: 2rem;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 2rem;
}

.panel + .panel {
  margin-top: 1.5rem;
}

.panel {
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  padding: 1.5rem;
  background: #fafbff;
}

.drop-zone {
  border: 2px dashed #94a3b8;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  background: #f8fbff;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.drop-zone--active {
  border-color: #2563eb;
  background: #eef4ff;
}

.drop-zone input[type='file'] {
  margin-top: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
  gap: 0.25rem;
}

input,
select,
button {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 1rem;
}

button.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #dc2626;
}

.hint {
  color: #475569;
}

.result {
  background: #fff;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
}

.download {
  display: inline-block;
  margin-top: 0.75rem;
  color: #2563eb;
}

pre {
  max-height: 320px;
  overflow: auto;
  padding: 1rem;
  border-radius: 8px;
  background: #111827;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.log-list {
  list-style: disc;
  padding-left: 1.25rem;
  max-height: 240px;
  overflow: auto;
  margin: 0;
  font-size: 0.9rem;
  color: #1f2937;
}
</style>
