# Haiku 5.5 — Smooth Open-Source Chatbot (GitHub Pages Ready)

A fast, tactile, zero-backend AI chat application built around **Anthropic Claude Haiku 5.5** (`claude-haiku-5-5`).

Unlike traditional Python/Ollama starter repos that require a live backend server, **`open-source-chatbot-fixed`** runs **100% in the browser** with pure HTML, CSS, and modular JavaScript—making it work out-of-the-box on **GitHub Pages**, Cloudflare Pages, Netlify, any static web host, or even locally without a build step.

---

## ✨ Highlights

- **Built for Claude Haiku 5.5 (`claude-haiku-5-5`)**
  - **1M token context window** & up to **128K output tokens** with live token & cost estimation (`$0.10/M` input · `$0.50/M` output under 100K tokens).
  - **Adaptive Thinking & Effort Controls** (`Instant / Off`, `Low`, `Medium`, `High`, `Max`) with collapsible real-time *Thought Process* accordions.
  - **Multimodal Vision & File Attachments** — drag-and-drop, browse, or `Ctrl/Cmd + V` paste screenshots, images (`PNG`, `JPEG`, `WEBP`, `GIF`), and code/text files.
- **4 Web-Compatible Connection Modes**
  1. **Puter Cloud (Default · Free · Zero Key)** — Streams `claude-haiku-5-5` directly in the browser via Puter.js v2 with zero API keys or servers required.
  2. **Anthropic Direct API (BYOK)** — Connects straight from the browser to `https://api.anthropic.com/v1/messages` via Anthropic’s official CORS header (`anthropic-dangerous-direct-browser-access: true`), supporting SSE streaming, Adaptive Thinking, and Ephemeral Prompt Caching.
  3. **OpenRouter / Custom Gateway** — Connects to `openrouter.ai` (`anthropic/claude-haiku-5.5`) or any CORS-enabled OpenAI-compatible `/v1/chat/completions` endpoint.
  4. **Interactive Sandbox** — Built-in offline streaming preview for testing Markdown, syntax highlighting, and live HTML/SVG previews without network access.
- **60fps Liquid-Smooth Interface**
  - `requestAnimationFrame`-batched Markdown & syntax-highlighted code streaming with smart scroll-lock detection.
  - **Built-in Live HTML/SVG Artifact Preview** — click **Run Preview** on any generated `html` or `svg` block to launch it in a sandboxed side-by-side preview drawer.
  - Multi-conversation history, search, pinning, inline message editing/branching, regeneration, Web Speech dictation & read-aloud, dark/light warm editorial themes, and `.md` / `.json` exports.

---

## 🚀 Publish on GitHub Pages in 30 Seconds

Every asset uses relative paths (`./css/...`, `./js/...`, `./assets/...`) with `index.html` and `.nojekyll` right at the repository root, so both GitHub Pages deployment modes work immediately:

### Option A: Deploy from Branch (Simplest)
1. Push this repository to GitHub (on the `main` branch).
2. Open your repository **Settings → Pages**.
3. Under **Build and deployment → Source**, select **Deploy from a branch**.
4. Choose branch **`main`** and folder **`/ (root)`**, then click **Save**.
5. Your chatbot will be live at `https://<your-username>.github.io/open-source-chatbot-fixed/`.

### Option B: Deploy via GitHub Actions
1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions** — the included [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) workflow automatically deploys on every push to `main`.

---

## 💻 Run Locally

No `npm install` or bundler is required:

```bash
# Python 3 built-in static server
python3 -m http.server 8000
```

Or with Node.js:

```bash
npx serve .
```

Then visit `http://localhost:8000`.

---

## 🔒 API Key Security Note

- **Never hard-code API keys** inside `index.html` or `js/*.js` before pushing to a public repository.
- When using **Anthropic API** or **OpenRouter**, enter your key inside the in-app **Settings → Connection & Keys** modal. Keys are stored exclusively in your own browser’s `localStorage` (or `sessionStorage` when **Session-only key storage** is enabled) and are **never** included in exported `.json` or `.md` chat backups.

---

## 📁 Project Structure

```text
.
├── index.html                        # Root entry point for GitHub Pages
├── 404.html                          # Subpath fallback redirect
├── .nojekyll                         # Disables Jekyll processing on GitHub Pages
├── manifest.webmanifest              # Installable web app metadata
├── assets/
│   └── favicon.svg                   # Vector app icon
├── css/
│   └── styles.css                    # Warm dark/light theme & 60fps layout
├── js/
│   ├── config.js                     # Claude Haiku 5.5 specs, personas & starter prompts
│   ├── storage.js                    # Safe browser persistence & Markdown/JSON export
│   ├── markdown.js                   # XSS-safe streaming Markdown + code syntax highlighter
│   ├── providers.js                  # Anthropic CORS SSE, Puter.js v2, OpenRouter & Sandbox
│   └── app.js                        # UI state, rAF stream renderer, attachments & shortcuts
└── .github/workflows/deploy-pages.yml
```

## 📄 License

Released under the [MIT License](./LICENSE).
