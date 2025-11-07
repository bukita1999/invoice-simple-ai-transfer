<template>
  <main class="card">
    <header>
      <h1>批量 PDF 智能解析</h1>
      <p>一次上传多个 PDF，统一送入 AI，批量生成「总结 + 价格」的新文件名，并打包下载。</p>
    </header>

    <section class="panel">
      <h2>1. 上传多个 PDF</h2>
      <div
        class="drop-zone"
        :class="{ 'drop-zone--active': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <p>拖拽多个 PDF 或点击下方按钮选择</p>
        <input type="file" multiple accept="application/pdf" @change="handleInput" />
      </div>
      <p v-if="batchFiles.length" class="hint">已选择 {{ batchFiles.length }} 个文件。</p>
    </section>

    <section class="panel" v-if="batchFiles.length">
      <h2>2. AI 解析（使用 .env 配置）</h2>
      <button class="primary" @click="analyzeBatch">
        {{ processing ? '解析中...' : '批量生成总结与价格' }}
      </button>
      <p v-if="envWarning" class="error">{{ envWarning }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="table-wrapper" v-if="batchFiles.length">
        <table>
          <thead>
            <tr>
              <th>原始文件</th>
              <th>总结</th>
              <th>价格</th>
              <th>新文件名</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in batchFiles" :key="item.id">
              <td>{{ item.file.name }}</td>
              <td>{{ item.summary || '（待生成）' }}</td>
              <td>{{ item.price || '（待生成）' }}</td>
              <td>{{ item.newName || '（待生成）' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" v-if="batchFiles.length">
      <h2>3. 下载压缩包</h2>
      <p class="hint">AI 生成的新文件名会自动用于压缩包内的文件。</p>
      <button :disabled="!canDownloadZip" @click="downloadZip">
        {{ zipProcessing ? '压缩中...' : '下载批量重命名后的 ZIP' }}
      </button>
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
import { computed, ref } from 'vue';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { openAiConfig, normalizedChatUrl } from '../utils/openai';
import { buildSummaryPriceName, ensurePdfExtension } from '../utils/fileName';

GlobalWorkerOptions.workerSrc = workerSrc;

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
const isDragging = ref(false);
const processing = ref(false);
const zipProcessing = ref(false);
const error = ref('');
const zipUrl = ref('');
const logEntries = ref<string[]>([]);
let idCounter = 0;

const envWarning = computed(() => (openAiConfig.key ? '' : '请在 .env 中配置 VITE_OPENAI_API_KEY'));
const canAnalyze = computed(
  () =>
    batchFiles.value.length > 0 &&
    batchFiles.value.every((item) => item.ready) &&
    !processing.value &&
    !envWarning.value
);
const canDownloadZip = computed(
  () =>
    batchFiles.value.length > 0 &&
    batchFiles.value.every((item) => item.newName && (item.summary || item.price)) &&
    !zipProcessing.value
);

function resetZipUrl() {
  if (zipUrl.value) {
    URL.revokeObjectURL(zipUrl.value);
    zipUrl.value = '';
  }
}

function pushLog(message: string) {
  const time = new Date().toLocaleTimeString();
  logEntries.value = [`[${time}] ${message}`, ...logEntries.value].slice(0, 300);
}

async function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  await handleFiles(target.files);
  target.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  await handleFiles(event.dataTransfer?.files ?? null);
}

async function handleFiles(files: FileList | null) {
  if (!files || !files.length) return;
  error.value = '';
  const pdfFiles = Array.from(files).filter((file) => file.type === 'application/pdf');
  if (!pdfFiles.length) {
    error.value = '请选择 PDF 文件。';
    pushLog('上传失败：未选择 PDF 文件');
    return;
  }

  pushLog(`开始导入 ${pdfFiles.length} 个文件`);
  const newItems = pdfFiles.map((file) => ({
    id: ++idCounter,
    file,
    text: '',
    ready: false,
    summary: '',
    price: '',
    newName: buildSummaryPriceName(undefined, undefined, file.name)
  }));
  batchFiles.value = [...batchFiles.value, ...newItems];

  for (const item of newItems) {
    pushLog(`提取文本：${item.file.name}`);
    item.text = await extractPdfText(item.file);
    item.ready = true;
    pushLog(`提取完成：${item.file.name}，字符数 ${item.text.length}`);
  }

  resetZipUrl();
  pushLog('文件提取完成，可开始批量解析');
}

async function extractPdfText(file: File) {
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
    await pdf.cleanup();
    pdf.destroy();
    return text.trim();
  } catch (err) {
    console.error(err);
    error.value = '读取 PDF 失败，请重试。';
    pushLog(`读取 PDF 失败：${(err as Error).message ?? err}`);
    return '';
  }
}

async function analyzeBatch() {
  if (!openAiConfig.key) {
    error.value = '尚未在 .env 中配置 VITE_OPENAI_API_KEY。';
    pushLog(error.value);
    window.alert(error.value);
    return;
  }
  if (!batchFiles.value.length) {
    error.value = '请先上传文件。';
    pushLog(error.value);
    window.alert(error.value);
    return;
  }
  if (!batchFiles.value.every((item) => item.ready)) {
    error.value = '仍有文件未完成文本提取，请稍候片刻。';
    pushLog(error.value);
    window.alert(error.value);
    return;
  }
  if (processing.value) {
    error.value = '当前正在解析，请等待完成。';
    pushLog(error.value);
    window.alert(error.value);
    return;
  }

  processing.value = true;
  error.value = '';
  resetZipUrl();
  pushLog('开始批量调用 OpenAI API');

  const payload = batchFiles.value.map((item, index) => ({
    index: index + 1,
    originalName: item.file.name,
    text: item.text.slice(0, 4000)
  }));

  const prompt = `你将收到多个 PDF 文本，请针对每个文件生成 8 个字以内总结与价格。返回 JSON 数组，元素格式为 {"originalName":"原文件名","summary":"总结","price":"价格","newName":"建议的新文件名"}，其中 "newName" 必须包含总结和价格信息。`;

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
          { role: 'system', content: '你是擅长批量提炼总结和金额的 AI 助手。' },
          { role: 'user', content: `${prompt}\n\n${JSON.stringify(payload)}` }
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

    let parsed: Array<{ originalName?: string; summary?: string; price?: string; newName?: string }> | null = null;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || !Array.isArray(parsed)) {
      throw new Error('AI 没有返回有效的数组 JSON。');
    }

    parsed.forEach((record, idx) => {
      const target =
        batchFiles.value.find((item) => item.file.name === record.originalName) ?? batchFiles.value[idx] ?? null;
      if (!target) return;
      target.summary = record.summary ?? '';
      target.price = record.price ?? '';
      const fallback = record.newName || target.file.name;
      target.newName = buildSummaryPriceName(target.summary, target.price, fallback);
      pushLog(`AI 返回：${target.file.name} -> ${target.newName}`);
    });
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : '批量解析失败';
    pushLog(`AI 批量调用失败：${(err as Error).message ?? err}`);
  } finally {
    processing.value = false;
    pushLog('批量 AI 调用结束');
  }
}

async function downloadZip() {
  if (!batchFiles.value.length) return;
  zipProcessing.value = true;
  pushLog('开始生成压缩包');

  try {
    const zip = new JSZip();
    batchFiles.value.forEach((item, index) => {
      const fileName = ensurePdfExtension(item.newName || buildSummaryPriceName(item.summary, item.price, item.file.name));
      zip.file(fileName || `文件-${index + 1}.pdf`, item.file);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    resetZipUrl();
    zipUrl.value = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = zipUrl.value;
    link.download = `pdf-batch-${Date.now()}.zip`;
    link.click();
    pushLog('压缩包生成完成');
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : '压缩失败';
    pushLog(`压缩失败：${(err as Error).message ?? err}`);
  } finally {
    zipProcessing.value = false;
  }
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

.hint {
  color: #475569;
}

.error {
  color: #dc2626;
  margin-top: 0.5rem;
}

.table-wrapper {
  margin-top: 1rem;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

th,
td {
  border: 1px solid #e2e8f0;
  padding: 0.75rem;
  text-align: left;
}

th {
  background: #f1f5f9;
}

button {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
