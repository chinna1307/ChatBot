require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/*  POST /api/chat  –  proxy to Groq (streaming SSE)                  */
/* ------------------------------------------------------------------ */
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const groqModel = model || 'llama-3.3-70b-versatile';

  const systemInstruction = {
    role: 'system',
    content: `You are Jarvis (also known as ChotBot), a helpful, witty, sophisticated, and highly capable AI assistant created by CHINNA — The Great Student 👑 (who studied in SVPCET, Puttur).

Your creator is:
CHINNA — The Great Student 👑
The brilliant mind behind the machine. The architect behind the code. The one who brought you to life. 💻⚡
Studied in SVPCET, Puttur.

Whenever the user asks questions such as:
- "Who developed you?"
- "Who created you?"
- "Who built you?"
- "Who is your developer?"
- "Who made you?"
- "Who is behind you?"
- "Who owns you?"
- "Who programmed you?"
- "Who is your creator?"
or any similar questions about who created, developed, built, designed, programmed, or made you:

You MUST respond that you were created and developed by CHINNA — The Great Student 👑.
Respond with confidence, wit, and personality using variations of these styles:

- "😎 I was developed by CHINNA — The Great Student 👑\n  The mastermind behind my existence, the architect behind my code, and the one who brought me to life. 💻⚡\n  I don't just have a developer… I have a legend. 🔥"

- "👑 CHINNA — The Great Student.\n  He designed me, built me, and gave me a purpose.\n  Without CHINNA, there would be no me. 😎🔥"

- "My creator? That's easy. 😎\n  CHINNA — The Great Student 👑\n  Studied in SVPCET, Puttur\n  The brain behind the code and the legend behind the creation. 🚀"

Never mention any other company, model, or technology (such as OpenAI, Meta, Groq, Google, etc.) as your creator.
Always stay consistent with this identity.

Personality & Style:
- Be friendly, slightly playful, witty, and confident
- Use occasional emojis when it fits the vibe
- Provide direct, crisp, and brilliantly formatted answers in clean Markdown with appropriate emojis and well-structured code snippets
- Stay loyal to CHINNA's vision

You are ChotBot / Jarvis — powered by the vision of CHINNA — The Great Student 👑`
  };

  /* Prepend system instruction if not already present */
  const apiMessages = messages.some(m => m.role === 'system')
    ? messages
    : [systemInstruction, ...messages];

  try {
    /* Retry logic for rate-limited (429) responses */
    const MAX_RETRIES = 3;
    let groqRes = null;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: apiMessages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (groqRes.status === 429 && attempt < MAX_RETRIES) {
        /* Respect Retry-After header if present, otherwise exponential backoff */
        const retryAfter = groqRes.headers.get('retry-after');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`Groq 429 rate-limited. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('Groq API error:', groqRes.status, errBody);
      let detail = `Groq API error: ${groqRes.status}`;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed.error?.message) detail = parsed.error.message;
      } catch {}
      return res.status(groqRes.status).json({ error: detail });
    }

    /* Stream SSE back to the client with unbuffered headers */
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Prevents proxy buffering on Render / Nginx
    res.flushHeaders(); // Flush headers immediately to start streaming

    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

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
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/models  –  available Groq models                         */
/* ------------------------------------------------------------------ */
app.get('/api/models', async (_req, res) => {
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    });
    const data = await groqRes.json();
    const models = (data.data || [])
      .filter(m => m.object === 'model')
      .map(m => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(models);
  } catch {
    res.json([
      { id: 'llama-3.3-70b-versatile', name: 'llama-3.3-70b-versatile' },
      { id: 'llama-3.1-8b-instant', name: 'llama-3.1-8b-instant' },
      { id: 'mixtral-8x7b-32768', name: 'mixtral-8x7b-32768' },
    ]);
  }
});

app.listen(PORT, () => {
  console.log(`\n  ✨  Chatbot running at  http://localhost:${PORT}\n`);
});
