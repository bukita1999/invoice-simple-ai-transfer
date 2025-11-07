## PROEJCT_STRUCTURE

- `package.json:1` / `vite.config.ts` / `tsconfig*.json` define a Vite + Vue 3 + TypeScript SPA, expose `dev|build|preview` scripts, and pin deps like `vue-router`, `pdfjs-dist`, `jszip`.
- `index.html` | `src/main.ts:1` boot the app by mounting `App.vue` with the router and pulling in global styles from `src/style.css`.
- `src/router.ts:1` wires two routes: `/` for single-file analysis and `/batch` for batch mode, both rendered inside the shared chrome in `src/App.vue`.
- `src/pages/SingleAnalyzer.vue:1` implements the single-PDF workflow: drag-and-drop upload, text extraction via `pdfjs-dist`, OpenAI call through `openAiConfig`, and client-side rename/download with helpers from `src/utils/fileName.ts:1`.
- `src/pages/BatchAnalyzer.vue:1` manages multi-file ingestion, text extraction pipeline, batched OpenAI prompt submission, and ZIP packaging through `jszip`, reusing the same file-name helpers.
- `src/utils/openai.ts:1` centralizes OpenAI-related env config & endpoint normalization; `src/utils/fileName.ts:1` sanitizes names, enforces `.pdf`, and builds “summary - price” labels.
- Supporting assets: `src/style.css:1` provides the minimal global theme, `.env.example` documents required `VITE_OPENAI_*` keys, `README.md` (root) describes the tool’s purpose and usage, while `dist/` and `node_modules/` hold build artifacts and installed deps respectively.
