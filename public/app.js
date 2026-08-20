/* ========================================================================== */
/*  JARVIS STUDIO — Client Engine Logic                                       */
/*  Features: Streaming SSE, Markdown Canvas, Thought Accordion, Voice,       */
/*  Snippet Copy, Speech-to-Text, Model Catalog, Export & Archive             */
/* ========================================================================== */

(() => {
  'use strict';

  /* ── DOM Selectors ── */
  const $ = (s) => document.querySelector(s);
  const welcome          = $('#welcome');
  const messagesEl       = $('#messages');
  const messageInput     = $('#messageInput');
  const sendBtn          = $('#sendBtn');
  const stopBtn          = $('#stopBtn');
  const micBtn           = $('#micBtn');
  const newChatBtn       = $('#newChatBtn');
  const modelSelect      = $('#modelSelect');
  const modelBadge       = $('#modelBadge');
  const activeModelName  = $('#activeModelName');
  const convList         = $('#conversationList');
  const sidebar          = $('#sidebar');
  const sidebarToggle    = $('#sidebarToggle');
  const searchInput      = $('#searchInput');
  const exportBtn        = $('#exportBtn');
  const clearAllBtn      = $('#clearAllBtn');
  const scrollBottomBtn  = $('#scrollBottomBtn');
  const voiceToggleBtn   = $('#voiceToggleBtn');

  /* ── State ── */
  let conversations     = JSON.parse(localStorage.getItem('jarvis_convos') || localStorage.getItem('nova_convos') || '[]');
  let activeConvId      = null;
  let isStreaming        = false;
  let abortCtrl         = null;
  let isVoiceReadActive   = false;
  let recognition       = null;

  /* ── Configure marked ── */
  marked.setOptions({
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
  });

  /* ── Helpers ── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function save() {
    localStorage.setItem('jarvis_convos', JSON.stringify(conversations));
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Toast Notifications ── */
  function showToast(msg, isError = false) {
    let toast = document.querySelector('.error-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'error-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.borderColor = isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(167, 139, 250, 0.4)';
    toast.style.color = isError ? '#f87171' : '#c4b5fd';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  /* ======================================================================== */
  /*  Speech Synthesis & Recognition (Web Speech API)                         */
  /* ======================================================================== */
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.style.display = 'none';
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      micBtn.classList.add('listening');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      messageInput.value = (messageInput.value + ' ' + transcript).trim();
      messageInput.dispatchEvent(new Event('input'));
      messageInput.focus();
    };

    recognition.onerror = () => {
      micBtn.classList.remove('listening');
    };

    recognition.onend = () => {
      micBtn.classList.remove('listening');
    };

    micBtn.addEventListener('click', () => {
      if (micBtn.classList.contains('listening')) {
        recognition.stop();
      } else {
        try { recognition.start(); } catch {}
      }
    });
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/[#*`_~]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 320));
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  /* ======================================================================== */
  /*  Conversations Archive Management                                        */
  /* ======================================================================== */
  function createConversation(firstMsg) {
    const conv = {
      id: uid(),
      title: firstMsg.slice(0, 45) + (firstMsg.length > 45 ? '…' : ''),
      messages: [],
      created: Date.now(),
      updated: Date.now(),
    };
    conversations.unshift(conv);
    save();
    return conv;
  }

  function getActiveConv() {
    return conversations.find(c => c.id === activeConvId);
  }

  function switchConversation(id) {
    activeConvId = id;
    const conv = getActiveConv();
    if (!conv) return;

    welcome.classList.add('hidden');
    messagesEl.classList.add('active');
    messagesEl.innerHTML = '';

    conv.messages.forEach(m => appendMessage(m.role, m.content, false));
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderConvList();
    closeSidebar();
  }

  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    save();
    if (activeConvId === id) {
      activeConvId = null;
      messagesEl.classList.remove('active');
      messagesEl.innerHTML = '';
      welcome.classList.remove('hidden');
    }
    renderConvList();
  }

  function renderConvList(filter = '') {
    const lower = filter.toLowerCase();
    const filtered = lower
      ? conversations.filter(c => c.title.toLowerCase().includes(lower))
      : conversations;

    convList.innerHTML = filtered.map(c => `
      <div class="conv-item ${c.id === activeConvId ? 'active' : ''}" data-id="${c.id}">
        <div class="conv-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div class="conv-info">
          <div class="conv-title">${escapeHtml(c.title)}</div>
          <div class="conv-date">${formatDate(c.updated)}</div>
        </div>
        <button class="conv-delete" data-del="${c.id}" title="Delete session">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  /* ======================================================================== */
  /*  Markdown & Thought Block Rendering                                      */
  /* ======================================================================== */
  function renderMarkdown(text) {
    let processed = text;

    /* Handle <think>...</think> tags or unclosed think blocks from reasoning models */
    processed = processed.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_, thought) => {
      const trimmed = thought.trim();
      if (!trimmed) return '';
      return `<details class="thought-box">
        <summary class="thought-summary">
          <svg class="thought-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          Jarvis is thinking...
        </summary>
        <div class="thought-content">${marked.parse(trimmed)}</div>
      </details>`;
    });

    let html = marked.parse(processed);

    /* Enhance code blocks with modern header and copy action */
    html = html.replace(
      /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => `
        <pre>
          <div class="code-deck-header">
            <span>${lang}</span>
            <button class="copy-snippet-btn" onclick="navigator.clipboard.writeText(this.closest('pre').querySelector('code').textContent).then(()=>{this.innerHTML='✓ Copied';setTimeout(()=>this.innerHTML='Copy',1600)})">
              Copy
            </button>
          </div>
          <code class="language-${lang}">${code}</code>
        </pre>`
    );

    html = html.replace(
      /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
      (_, code) => `
        <pre>
          <div class="code-deck-header">
            <span>code</span>
            <button class="copy-snippet-btn" onclick="navigator.clipboard.writeText(this.closest('pre').querySelector('code').textContent).then(()=>{this.innerHTML='✓ Copied';setTimeout(()=>this.innerHTML='Copy',1600)})">
              Copy
            </button>
          </div>
          <code>${code}</code>
        </pre>`
    );

    return html;
  }

  function appendMessage(role, content, animate = true) {
    const el = document.createElement('div');
    el.className = `message-item ${role}`;
    if (!animate) el.style.animation = 'none';

    if (role === 'user') {
      el.innerHTML = `
        <div class="user-bubble">${escapeHtml(content)}</div>
        <div class="user-actions">
          <button class="icon-btn-action" data-action="copy" title="Copy text">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="icon-btn-action" data-action="share" title="Share message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          </button>
          <button class="icon-btn-action" data-action="edit" title="Edit prompt">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="assistant-body">${renderMarkdown(content)}</div>
        <div class="icon-action-toolbar">
          <button class="icon-btn-action" data-action="copy" title="Copy response">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="icon-btn-action" data-action="dislike" title="Bad response">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
          </button>
          <button class="icon-btn-action" data-action="share" title="Share response">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          </button>
          <button class="icon-btn-action" data-action="regenerate" title="Retry">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
          <button class="icon-btn-action" data-action="more" title="More">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
          </button>
        </div>
      `;
    }

    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function appendTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'message-item assistant';
    el.id = 'typing';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'JARVIS is thinking');
    el.innerHTML = `
      <div class="assistant-body">
        <div class="thinking-indicator" role="status">
          <div class="thinking-header">
            <svg class="thinking-icon-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            <span class="thinking-text">Thinking</span>
            <div class="typing-dots" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    `;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    /* Safe single-remove helper — prevents double-remove errors */
    let removed = false;
    el.removeOnce = () => { if (!removed) { removed = true; el.remove(); } };
    return el;
  }

  /* ======================================================================== */
  /*  Streaming SSE Pipeline                                                  */
  /* ======================================================================== */
  async function sendMessage(text) {
    if (!text.trim() || isStreaming) return;

    let conv = getActiveConv();
    if (!conv) {
      conv = createConversation(text);
      activeConvId = conv.id;
      welcome.classList.add('hidden');
      messagesEl.classList.add('active');
      messagesEl.innerHTML = '';
      renderConvList();
    }

    conv.messages.push({ role: 'user', content: text });
    conv.updated = Date.now();
    save();
    appendMessage('user', text);

    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    isStreaming = true;
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    abortCtrl = new AbortController();

    let fullResponse = '';
    let displayedLen = 0;
    let streamFinished = false;

    /* ── Thinking indicator appears IMMEDIATELY before any API call ── */
    const typingEl = appendTypingIndicator();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
          model: modelSelect.value,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        let errMsg = 'Inference error. Please verify your connection or model.';
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }

      /* ── First token/response arrived — remove thinking, show response ── */
      typingEl.removeOnce();
      const assistantEl = appendMessage('assistant', '');
      const bodyEl = assistantEl.querySelector('.assistant-body');

      /* Typewriter Animation Ticker */
      const typeWriterPromise = new Promise((resolve) => {
        const typeInterval = setInterval(() => {
          if (displayedLen < fullResponse.length) {
            const remaining = fullResponse.length - displayedLen;
            // Adaptive typing speed: 1-2 chars for close stream, 4-8 chars for bursts
            const step = remaining > 80 ? 8 : remaining > 30 ? 4 : remaining > 10 ? 2 : 1;
            displayedLen = Math.min(displayedLen + step, fullResponse.length);

            const currentSlice = fullResponse.slice(0, displayedLen);
            bodyEl.innerHTML = renderMarkdown(currentSlice) + '<span class="typing-cursor">▌</span>';
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else if (streamFinished) {
            clearInterval(typeInterval);
            bodyEl.innerHTML = renderMarkdown(fullResponse);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            resolve();
          }
        }, 14);
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const data = JSON.parse(payload);
            if (data.content) {
              fullResponse += data.content;
            }
          } catch {}
        }
      }

      streamFinished = true;
      await typeWriterPromise;
    } catch (err) {
      /* ── Always remove thinking on error/abort/network-fail/timeout ── */
      typingEl.removeOnce();
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Inference error. Please verify your connection or model.', true);
        console.error(err);
      }
    } finally {
      /* ── Ensure thinking is gone and input is restored in ALL cases ── */
      typingEl.removeOnce();
      isStreaming = false;
      stopBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
      sendBtn.disabled = !messageInput.value.trim();

      if (fullResponse) {
        conv.messages.push({ role: 'assistant', content: fullResponse });
        conv.updated = Date.now();

        if (conv.messages.length === 2) {
          conv.title = conv.messages[0].content.slice(0, 45) + (conv.messages[0].content.length > 45 ? '…' : '');
        }
        save();
        renderConvList();

        if (isVoiceReadActive) {
          speakText(fullResponse);
        }
      }
    }
  }

  /* ======================================================================== */
  /*  Model Engine Catalog                                                    */
  /* ======================================================================== */
  async function loadModels() {
    const preferred = ['google/gemini-2.5-flash:free', 'google/gemini-2.0-flash-exp:free', 'meta-llama/llama-4-maverick:free'];

    try {
      const res = await fetch('/api/models');
      let models = await res.json();

      if (models.length === 0) throw new Error();

      const defaultId = preferred.find(p => models.some(m => m.id === p)) || models[0].id;

      modelSelect.innerHTML = models.map(m =>
        `<option value="${m.id}" ${m.id === defaultId ? 'selected' : ''}>${m.name}</option>`
      ).join('');

      updateActiveModelLabel(defaultId);
    } catch {
      modelSelect.innerHTML = `
        <option value="google/gemini-2.5-flash:free" selected>Gemini 2.5 Flash (Free)</option>
        <option value="groq/qwen-qwq-32b">⚡ qwen-qwq-32b (Groq)</option>
      `;
      updateActiveModelLabel('google/gemini-2.5-flash:free');
    }
  }

  function updateActiveModelLabel(modelId) {
    activeModelName.textContent = modelId;
    const id = modelId.toLowerCase();
    if (id.includes('gemini')) {
      modelBadge.textContent = '✨ Gemini';
      modelBadge.style.background = 'rgba(56, 189, 248, 0.12)';
      modelBadge.style.color = '#38bdf8';
    } else if (id.includes('compound')) {
      modelBadge.textContent = '🔗 Compound';
      modelBadge.style.background = 'rgba(251, 191, 36, 0.12)';
      modelBadge.style.color = '#fbbf24';
    } else if (id.includes('llama')) {
      modelBadge.textContent = '🦙 Llama';
      modelBadge.style.background = 'rgba(239, 68, 68, 0.12)';
      modelBadge.style.color = '#ef4444';
    } else if (id.includes('qwen')) {
      modelBadge.textContent = '🧠 Reasoning';
      modelBadge.style.background = 'rgba(196, 181, 253, 0.12)';
      modelBadge.style.color = '#c4b5fd';
    } else if (id.includes('deepseek')) {
      modelBadge.textContent = '🔬 DeepSeek';
      modelBadge.style.background = 'rgba(16, 185, 129, 0.12)';
      modelBadge.style.color = '#10b981';
    } else if (id.includes('mistral') || id.includes('mixtral')) {
      modelBadge.textContent = '🌀 Mistral';
      modelBadge.style.background = 'rgba(251, 146, 60, 0.12)';
      modelBadge.style.color = '#fb923c';
    } else if (id.startsWith('groq/')) {
      modelBadge.textContent = '⚡ Groq';
      modelBadge.style.background = 'rgba(16, 185, 129, 0.12)';
      modelBadge.style.color = '#10b981';
    } else {
      modelBadge.textContent = '🤖 AI';
      modelBadge.style.background = 'rgba(148, 163, 184, 0.12)';
      modelBadge.style.color = '#94a3b8';
    }
  }

  /* ======================================================================== */
  /*  Event Handlers                                                          */
  /* ======================================================================== */
  sendBtn.addEventListener('click', () => sendMessage(messageInput.value));
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value);
    }
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
    sendBtn.disabled = !messageInput.value.trim();
  });

  stopBtn.addEventListener('click', () => {
    if (abortCtrl) abortCtrl.abort();
  });

  modelSelect.addEventListener('change', () => {
    updateActiveModelLabel(modelSelect.value);
  });

  /* New Chat */
  newChatBtn.addEventListener('click', () => {
    activeConvId = null;
    messagesEl.classList.remove('active');
    messagesEl.innerHTML = '';
    welcome.classList.remove('hidden');
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendBtn.disabled = true;
    renderConvList();
    closeSidebar();
  });

  /* Keyboard shortcut Ctrl+K */
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      newChatBtn.click();
    }
  });

  /* Conversation Selection */
  convList.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      e.stopPropagation();
      deleteConversation(delBtn.dataset.del);
      return;
    }
    const item = e.target.closest('.conv-item');
    if (item) switchConversation(item.dataset.id);
  });

  /* Message Actions Delegation (Copy, Dislike, Listen, Retry) */
  messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn-action');
    if (!btn) return;

    const action = btn.dataset.action;
    const msgEl = btn.closest('.message-item');
    const contentEl = msgEl.querySelector('.assistant-body') || msgEl.querySelector('.user-bubble');
    const bodyText = contentEl ? contentEl.innerText : '';

    if (action === 'copy') {
      navigator.clipboard.writeText(bodyText).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 1600);
      });
    } else if (action === 'dislike') {
      btn.classList.toggle('active');
      showToast(btn.classList.contains('active') ? 'Feedback recorded' : 'Feedback removed');
    } else if (action === 'speak') {
      speakText(bodyText);
    } else if (action === 'regenerate') {
      const conv = getActiveConv();
      if (conv && conv.messages.length >= 2) {
        const lastUserMsg = [...conv.messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          conv.messages.pop();
          msgEl.remove();
          sendMessage(lastUserMsg.content);
        }
      }
    }
  });

  /* Prompt Cards */
  document.querySelectorAll('.curated-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      messageInput.value = prompt;
      sendBtn.disabled = false;
      sendMessage(prompt);
    });
  });

  /* Search */
  searchInput.addEventListener('input', () => {
    renderConvList(searchInput.value);
  });

  /* Export current chat to Markdown */
  exportBtn.addEventListener('click', () => {
    const conv = getActiveConv();
    if (!conv || conv.messages.length === 0) {
      showToast('No active conversation to export');
      return;
    }

    let md = `# ${conv.title}\n*Exported from JARVIS on ${new Date().toLocaleString()}*\n\n---\n\n`;
    conv.messages.forEach(m => {
      md += `### ${m.role === 'user' ? '👤 User' : '✦ JARVIS'}\n\n${m.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported Markdown file!');
  });

  /* Clear all */
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Clear all conversation history?')) {
      conversations = [];
      save();
      newChatBtn.click();
    }
  });

  /* Scroll-to-Bottom Tracker */
  messagesEl.addEventListener('scroll', () => {
    const isNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
    if (isNearBottom) {
      scrollBottomBtn.classList.add('hidden');
    } else {
      scrollBottomBtn.classList.remove('hidden');
    }
  });

  scrollBottomBtn.addEventListener('click', () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  /* Voice Auto-Read Toggle */
  voiceToggleBtn.addEventListener('click', () => {
    isVoiceReadActive = !isVoiceReadActive;
    voiceToggleBtn.classList.toggle('active', isVoiceReadActive);
    showToast(isVoiceReadActive ? 'Voice Narration ON' : 'Voice Narration OFF');
  });

  /* Mobile Drawer Toggle & Backdrop */
  const sidebarBackdrop = $('#sidebarBackdrop');
  const sidebarCloseBtn = $('#sidebarCloseBtn');

  function openSidebar() {
    sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });

  /* ── Boot ── */
  setupSpeechRecognition();
  loadModels();
  renderConvList();

})();
