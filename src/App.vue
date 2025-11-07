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
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

const defaultApiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? '';
const defaultBaseUrl = (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined)?.trim() ?? 'https://api.openai.com/v1';
const defaultModel = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim() ?? 'gpt-4o-mini';

const apiConfig = {
  key: defaultApiKey,
  baseUrl: defaultBaseUrl || 'https://api.openai.com/v1',
  model: defaultModel || 'gpt-4o-mini'
};

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

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function ensurePdfExtension(name: string) {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

function updateRenameSuggestion() {
  if (!summary.value && !price.value) return;
  const parts = [summary.value, price.value].filter(Boolean);
  if (!parts.length) return;
  const safeBase = sanitizeFileName(parts.join(' - ')) || '文档';
  renameInput.value = ensurePdfExtension(safeBase);
}

const fileName = computed(() => droppedFile.value?.name ?? '');
const charCount = computed(() => pdfText.value.length);
const envWarning = computed(() => (apiConfig.key ? '' : '请在 .env 中配置 VITE_OPENAI_API_KEY'));
const canAnalyze = computed(() => !processing.value && Boolean(pdfText.value) && !envWarning.value);

watch([summary, price], () => {
  if (!processing.value) {
    updateRenameSuggestion();
  }
});

async function handleFiles(files: FileList | null) {
  if (!files || !files.length) return;
  const file = files[0];
  if (file.type !== 'application/pdf') {
    error.value = '请上传 PDF 文件。';
    return;
  }
  error.value = '';
  summary.value = '';
  price.value = '';
  renameMessage.value = '';
  droppedFile.value = file;
  renameInput.value = file.name;
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
  } catch (err) {
    console.error(err);
    error.value = '读取 PDF 失败，请重试。';
  }
}

async function analyzeWithChatGPT() {
  if (!apiConfig.key) {
    error.value = '尚未在 .env 中配置 VITE_OPENAI_API_KEY。';
    return;
  }
  if (!pdfText.value) {
    error.value = '尚未解析到文本。';
    return;
  }
  processing.value = true;
  error.value = '';

  const prompt = `你是文件解析助手。请根据以下 PDF 提取的原始文本，仅输出 JSON，格式为 {"summary":"8个字以内的总结","price":"价格数值或描述"}。`;

  try {
    const normalizedBaseUrl = apiConfig.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.key}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
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
    updateRenameSuggestion();
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : '解析失败';
  } finally {
    processing.value = false;
  }
}

function renamePdf() {
  if (!droppedFile.value || !renameInput.value) {
    renameMessage.value = '请先上传文件并输入新名称。';
    return;
  }

  const safeName = renameInput.value.endsWith('.pdf') ? renameInput.value : `${renameInput.value}.pdf`;
  const renamedFile = new File([droppedFile.value], safeName, { type: droppedFile.value.type });

  if (renamedUrl.value) {
    URL.revokeObjectURL(renamedUrl.value);
  }
  renamedUrl.value = URL.createObjectURL(renamedFile);
  renameInput.value = safeName;
  renameMessage.value = `已生成 ${safeName}，点击下方链接即可下载。`;
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
</style>
