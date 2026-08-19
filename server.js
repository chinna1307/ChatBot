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
    content: 'You are Nova AI, a helpful, intelligent, and concise AI assistant. Provide direct, well-structured, and helpful responses formatted in clean Markdown. Unless specifically asked to show your step-by-step reasoning or thought process, respond directly without prefixing meta-commentary or drafting outlines.'
  };

  /* Prepend system instruction if not already present */
  const apiMessages = messages.some(m => m.role === 'system')
    ? messages
    : [systemInstruction, ...messages];

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq API error:', groqRes.status, err);
      return res.status(groqRes.status).json({ error: `Groq API error: ${groqRes.status}` });
    }

    /* Stream SSE back to the client */
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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
    res.status(500).json({ error: 'Internal server error' });
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
