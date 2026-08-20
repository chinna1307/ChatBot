# JARVIS — Luxury Conversational Studio

A state-of-the-art conversational AI interface built with an ultra-fast Groq LPU backend and an obsidian-glassmorphic frontend.

## ✨ Features

- **⚡ Blazing-Fast Streaming Inference**: Powered by Groq's low-latency LPU + OpenRouter fallback.
- **🎨 Obsidian & Starlight Aesthetics**: Minimalist luxury interface with ambient spotlights and frosted titanium cards.
- **🧠 Thought Process Accordion**: Collapsible reasoning display for thinking models (DeepSeek, Qwen, etc.).
- **🎙️ Voice Dictation & Text-to-Speech**: Hands-free voice prompts via Web Speech API.
- **📝 Code Canvas & Markdown**: Syntax highlighting, copy buttons, and formatted tables.
- **💾 Session Archive & Export**: Local storage persistence, keyword search, one-click Markdown export.

---

## 🚀 Quickstart

### Local (Node)

```bash
git clone https://github.com/chinna1307/ChatBot.git
cd ChatBot
npm install
cp .env.example .env   # then fill in your API keys
npm start
```

Open [http://localhost:10000](http://localhost:10000)

### Docker

```bash
# Build
docker build -t jarvis-ai .

# Run (reads keys from your .env file)
docker run --env-file .env -p 10000:10000 jarvis-ai
```

Open [http://localhost:10000](http://localhost:10000)  
Health check: [http://localhost:10000/health](http://localhost:10000/health)

---

## ☁️ Render Deployment

Render auto-detects the `Dockerfile` in the repository root.

**Steps:**
1. Push this repo to GitHub.
2. In Render → **New Web Service** → connect your GitHub repo.
3. Render detects Docker automatically. No extra build command needed.
4. In Render's **Environment** tab, add:
   - `GROQ_API_KEY` — your Groq key
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - *(Do NOT set PORT — Render injects it automatically)*
5. Set the **Health Check Path** to `/health`.
6. Deploy.

> ⚠️ Never commit real API keys. `.env` is in `.gitignore`.

---

## 🌐 API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the Jarvis frontend |
| `POST` | `/api/chat` | Streaming SSE chat proxy |
| `GET` | `/api/models` | Merged model catalog |
| `GET` | `/health` | Liveness probe |

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js (SSE streaming proxy)
- **Frontend**: HTML5, Vanilla CSS3, Vanilla JavaScript
- **Libraries**: Marked.js, Highlight.js
- **AI Providers**: Groq Cloud API + OpenRouter (with automatic fallback)
- **Container**: Docker (multi-stage, node:20-alpine)
- **Hosting**: Render (Docker)
