import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const destinationDir = join(__dirname, '../public');
const destination = join(destinationDir, 'pdf.worker.min.mjs');

await mkdir(destinationDir, { recursive: true });
await copyFile(source, destination);
console.log(`[copy-pdf-worker] Copied ${source} -> ${destination}`);
