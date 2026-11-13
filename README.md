# PolliChat — Free Keyless Multi-Model Chatbot (`pollinations.ai`)

A fast, smooth, **zero-API-key** open-source chatbot web app powered by **[pollinations.ai](https://pollinations.ai)** with instant **multi-model switching**.

Designed from the ground up as a **100% static browser app**, it requires no Python backend, no Node build step, and no API key—so it deploys directly to **GitHub Pages**, Cloudflare Pages, Netlify, or any static host in seconds.

---

## ✨ Features

- **Zero API Key Required (`pollinations.ai`)**
  - Connects out of the box to Pollinations’ keyless OpenAI-compatible text endpoint (`https://text.pollinations.ai/openai`) with `private: true` enabled by default.
  - Includes **Smart Keyless Fallback** — if a selected model requires Pollen credits or hits an alias mismatch, it automatically falls back cleanly so conversations keep flowing without errors.
- **Instant Multi-Model Switching (`⌘/Ctrl + M`)**
  - Switch models mid-conversation from the **Top Header**, **Welcome Quick-Chips**, or **Composer Toolbar**.
  - Curated built-in models ready immediately (`GPT-5 Nano (Fast)`, `GPT-5.4 Nano`, `GPT-OSS 20B`, `DeepSeek V4 Flash`, `Qwen3 Coder 30B`, `Mistral Large 3`, `Llama 3.3 70B`, `Kimi K3`, `GLM-5.3`, `Grok 4.3`, `Claude Haiku 5.5`, `Gemini 3.7 Flash`).
  - **Live Catalog Sync (`↻ Sync`)** — automatically discovers and merges live models from Pollinations’ public `/models` endpoints, plus lets you type any custom Pollinations model ID directly in the search bar.
  - Regenerate any assistant turn after switching models to compare responses side by side.
- **60fps Smooth Streaming & Code Studio**
  - `requestAnimationFrame`-batched Markdown streaming with smart scroll-lock detection.
  - Automatic `<think>…</think>` & `reasoning_content` extraction into collapsible **Thought process** accordions for reasoning models (`DeepSeek`, `GPT-OSS`, `GLM`, etc.).
  - Syntax-highlighted code cards with 1-click Copy and a built-in sandboxed **Live HTML / SVG Artifact Preview** drawer (**Run Preview**).
- **Complete Workspace Tools**
  - Multi-conversation sidebar with real-time search, pinning, rename, and delete.
  - Drag-and-drop or `Ctrl/Cmd + V` paste for images and text/code files.
  - Inline user message editing & conversation branching, Web Speech dictation & read-aloud, Dark / Light warm themes, and `.md` / `.json` local backups.

---

## 🚀 Publish on GitHub Pages

All assets use relative paths (`./css/...`, `./js/...`, `./assets/...`) with `index.html` and `.nojekyll` at the repository root:

### Option A: Deploy from a Branch (Recommended — Zero Config)
1. Merge/push to your **`main`** branch on GitHub.
2. Open **Settings → Pages** in your GitHub repository.
3. Under **Source**, choose **Deploy from a branch** → select **`main`** and **`/ (root)`** → click **Save**.
4. Visit `https://<your-username>.github.io/open-source-chatbot-fixed/`.

### Option B: GitHub Actions
1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. The included [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) workflow deploys automatically on push to `main`.

---

## 💻 Run Locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## 📄 License

Released under the [MIT License](./LICENSE).
