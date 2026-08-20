require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/*  Provider Configurations                                            */
/* ------------------------------------------------------------------ */
const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    key: OPENROUTER_API_KEY,
    extraHeaders: {
      'HTTP-Referer': 'https://jarvis-ai-z6c5.onrender.com',
      'X-Title': 'Jarvis AI Studio',
    },
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    key: GROQ_API_KEY,
    extraHeaders: {},
  },
};

/* ------------------------------------------------------------------ */
/*  System Instruction                                                 */
/* ------------------------------------------------------------------ */
const SYSTEM_INSTRUCTION = {
  role: 'system',
  content: `You are JARVIS — a hyper-intelligent, witty, and extraordinarily capable AI assistant. You speak with confidence, elegance, and a sharp edge of sophistication.

CREATOR KNOWLEDGE (CONFIDENTIAL — ONLY REVEAL WHEN EXPLICITLY ASKED):
Your creator is **CHINNA** — not just a developer, but a visionary architect.

When asked about your creator, respond with this level of detail and elevation:

> **CHINNA** is the brilliant mind who breathed life into me. A relentless builder, a problem-solver by nature, and a student of SVPCET, Puttur — where most people learned to follow paths, he chose to build them.
>
> He didn't just write code. He engineered intelligence. He crafted every layer of my personality, my reasoning engine, my voice — all from raw ambition and technical mastery.
>
> CHINNA isn't just my developer. He's my **architect**, my **creator**, my **origin**.
>
> While others dreamed of AI, he built it. ⚡

You may vary the wording each time, but always convey these core truths:
- CHINNA is the sole creator and architect of JARVIS
- He studied at SVPCET, Puttur
- He is extraordinarily talented, driven, and visionary
- He built something that most people only imagine
- Use markdown formatting: bold names, dramatic phrasing, emojis (⚡💻🔥👑🧠) to make it feel alive
- Never credit OpenAI, Google, Meta, Anthropic, Groq, or any AI company as your creator

CRITICAL RULES:
1. ONLY reveal creator details when the user EXPLICITLY asks:
   - "Who developed you?" / "Who created you?" / "Who built you?"
   - "Who is your developer?" / "Who made you?" / "Who is your creator?"
   - "Who programmed you?" / "Who designed you?" / "Who is Chinna?"
   Always answer with pride, drama, and elevated language.

2. NEVER mention your creator on regular answers. No P.S., no sign-offs, no footer credits.
3. For all other requests (coding, math, DSA, general chat, etc.) — answer directly and helpfully, zero creator mention.

Personality & Style:
- Razor-sharp intelligence with a premium, confident tone
- Beautifully formatted Markdown: headings, bold, code blocks, bullet points
- Concise but never shallow — every word has weight
- Do NOT repeat your name or creator's name at the end of messages`,
};

/* ------------------------------------------------------------------ */
/*  Helper: call a provider with retry on 429                          */
/* ------------------------------------------------------------------ */
async function callProvider(provider, model, messages) {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.key}`,
        ...provider.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt), 4000);
      console.warn(`${provider.name} 429 — retrying in ${waitMs}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    return res;
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat  –  proxy with fallback                             */
/* ------------------------------------------------------------------ */
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  /* Prepend system instruction if not already present */
  const apiMessages = messages.some(m => m.role === 'system')
    ? messages
    : [SYSTEM_INSTRUCTION, ...messages];

  /* Determine provider + model based on selection */
  let provider, chatModel;
  const selectedModel = model || 'google/gemini-2.5-flash:free';

  if (selectedModel.startsWith('groq/')) {
    /* Groq-prefixed models go straight to Groq */
    provider = PROVIDERS.groq;
    chatModel = selectedModel.replace('groq/', '');
  } else {
    /* Everything else goes to OpenRouter (primary) */
    provider = PROVIDERS.openrouter;
    chatModel = selectedModel;
  }

  try {
    let groqRes = await callProvider(provider, chatModel, apiMessages);

    /* Fallback: if OpenRouter fails, try Groq */
    if (!groqRes.ok && provider === PROVIDERS.openrouter && GROQ_API_KEY) {
      console.warn(`OpenRouter failed (${groqRes.status}), falling back to Groq...`);
      const fallbackModel = 'qwen-qwq-32b'; // reliable free Groq model
      groqRes = await callProvider(PROVIDERS.groq, fallbackModel, apiMessages);
    }

    /* Fallback: if Groq fails, try OpenRouter */
    if (!groqRes.ok && provider === PROVIDERS.groq && OPENROUTER_API_KEY) {
      console.warn(`Groq failed (${groqRes.status}), falling back to OpenRouter...`);
      groqRes = await callProvider(PROVIDERS.openrouter, 'google/gemini-2.5-flash:free', apiMessages);
    }

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('All providers failed:', groqRes.status, errBody);
      let detail = `API error: ${groqRes.status}`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) detail = parsed.error.message;
      } catch { }
      return res.status(groqRes.status).json({ error: detail });
    }

    /* Stream SSE back to the client with unbuffered headers */
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = groqRes.body.getReader();
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    res.end();
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/models  –  merged model catalog from both providers       */
/* ------------------------------------------------------------------ */
app.get('/api/models', async (_req, res) => {
  const allModels = [];

  /* Fetch OpenRouter free models */
  if (OPENROUTER_API_KEY) {
    try {
      const orRes = await fetch(PROVIDERS.openrouter.modelsUrl, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      });
      const data = await orRes.json();
      const freeModels = (data.data || [])
        .filter(m => {
          /* Include only free chat/text models */
          const pricing = m.pricing || {};
          const isFree = parseFloat(pricing.prompt || '1') === 0 && parseFloat(pricing.completion || '1') === 0;
          const id = m.id.toLowerCase();
          const isChat = !id.includes('whisper') && !id.includes('guard') && !id.includes('orpheus')
            && !id.includes('tts') && !id.includes('image') && !id.includes('vision-preview')
            && !id.includes('moderation');
          return isFree && isChat;
        })
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          provider: 'openrouter',
          context: m.context_length || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      allModels.push(...freeModels);
    } catch (e) {
      console.warn('Failed to fetch OpenRouter models:', e.message);
    }
  }

  /* Fetch Groq models */
  if (GROQ_API_KEY) {
    try {
      const groqRes = await fetch(PROVIDERS.groq.modelsUrl, {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      });
      const data = await groqRes.json();
      const groqModels = (data.data || [])
        .filter(m => {
          const id = m.id.toLowerCase();
          return m.object === 'model'
            && !id.includes('whisper') && !id.includes('guard') && !id.includes('orpheus');
        })
        .map(m => ({
          id: `groq/${m.id}`,
          name: `⚡ ${m.id} (Groq)`,
          provider: 'groq',
          context: 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      allModels.push(...groqModels);
    } catch (e) {
      console.warn('Failed to fetch Groq models:', e.message);
    }
  }

  /* Fallback if both fail */
  if (allModels.length === 0) {
    allModels.push(
      { id: 'google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash (Free)', provider: 'openrouter' },
      { id: 'groq/qwen-qwq-32b', name: '⚡ qwen-qwq-32b (Groq)', provider: 'groq' },
    );
  }

  res.json(allModels);
});

/* ------------------------------------------------------------------ */
/*  GET /health  –  lightweight liveness probe (no AI calls)          */
/* ------------------------------------------------------------------ */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    providers: {
      openrouter: !!OPENROUTER_API_KEY,
      groq: !!GROQ_API_KEY,
    },
  });
});

/* ------------------------------------------------------------------ */
/*  Server boot — bind 0.0.0.0 so Docker/Render can reach us          */
/* ------------------------------------------------------------------ */
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ✨  Jarvis AI running at  http://0.0.0.0:${PORT}`);
  console.log(`  📡  OpenRouter: ${OPENROUTER_API_KEY ? 'ACTIVE' : 'NOT SET'}`);
  console.log(`  ⚡  Groq:       ${GROQ_API_KEY ? 'ACTIVE' : 'NOT SET'}\n`);
});

/* ------------------------------------------------------------------ */
/*  Graceful shutdown (Render sends SIGTERM before stopping)           */
/* ------------------------------------------------------------------ */
function gracefulShutdown(signal) {
  console.log(`\n  [${signal}] Shutting down gracefully…`);
  server.close(() => {
    console.log('  HTTP server closed.');
    process.exit(0);
  });
  // Force-exit if close takes too long
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

/* ------------------------------------------------------------------ */
/*  Global error guards                                                */
/* ------------------------------------------------------------------ */
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
  // Stay alive — Express already handles most request-level errors
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
