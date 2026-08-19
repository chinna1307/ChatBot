# Nova AI — Next-Gen Conversational Studio

A state-of-the-art conversational AI interface built with an ultra-fast Groq LPU backend and an obsidian-glassmorphic frontend.

![Nova AI Preview](https://raw.githubusercontent.com/chinna1307/ChatBot/main/public/preview.png)

## ✨ Features

- **⚡ Blazing-Fast Streaming Inference**: Powered by Groq's low-latency LPU architecture (LLaMA 3.3 70B, DeepSeek, Qwen, etc.).
- **🎨 Obsidian & Starlight Aesthetics**: Minimalist luxury interface featuring ambient spotlight meshes, frosted titanium cards, and refined typography.
- **🧠 Thought Process Accordion**: Encapsulates internal reasoning steps for reasoning models in a collapsible dropdown (like DeepSeek & ChatGPT).
- **🎙️ Voice Dictation & Text-to-Speech**: Hands-free voice prompts and narration via Web Speech API.
- **📝 Code Canvas & Markdown**: Syntax highlighting with language tags, copy buttons, and formatted tables.
- **💾 Session Archive & Export**: Local storage conversation persistence, keyword search, and one-click Markdown export.

## 🚀 Quickstart

### 1. Clone the repository
```bash
git clone https://github.com/chinna1307/ChatBot.git
cd ChatBot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure API Key
Create a `.env` file in the project root:
```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```
*(Get a free API key at [console.groq.com](https://console.groq.com))*

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Tech Stack
- **Backend**: Node.js, Express.js (SSE streaming proxy)
- **Frontend**: HTML5, Vanilla CSS3 (Custom design system), Vanilla JavaScript
- **Libraries**: Marked.js (Markdown parsing), Highlight.js (Syntax highlighting)
- **AI Provider**: Groq Cloud API
