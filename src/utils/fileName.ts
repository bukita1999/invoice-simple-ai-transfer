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
