const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

if (!OPENROUTER_API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set in environment');
}

app.get('/', (req, res) => {
  res.json({ 
    status: 'ExamPro AI Proxy (OpenRouter) running', 
    model: MODEL,
    keyConfigured: !!OPENROUTER_API_KEY 
  });
});

function parseAIResponse(text) {
  if (!text) throw new Error('Empty response from AI');
  
  // Remove markdown
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Extract JSON array
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  
  if (start >= 0 && end > start) {
    text = text.substring(start, end + 1);
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('AI returned invalid JSON. Raw: ' + text.substring(0, 200));
  }
}

app.post('/api/generate-text', async (req, res) => {
  try {
    const { subject, count, notes } = req.body;
    
    const prompt = `Generate exactly ${count} multiple choice exam questions for the course "${subject}" based on these lecture notes.

RULES:
- Exactly ${count} questions
- Each has 4 options: A, B, C, D
- Include correct answer index (0=A, 1=B, 2=C, 3=D)
- Include brief explanation
- Base ONLY on the provided notes

Return ONLY this JSON format, no other text:
[{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why"}]

NOTES:
${notes}`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://exampro-ai-proxy.onrender.com',
        'X-Title': 'ExamPro AI'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 8192
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData.error?.message || `API error ${resp.status}`;
      
      if (resp.status === 429) {
        throw new Error('Rate limit hit. Wait 1 minute and try again.');
      }
      throw new Error(msg);
    }

    const data = await resp.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const questions = parseAIResponse(rawText);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('AI returned empty questions array');
    }
    
    res.json({ success: true, questions });
  } catch (err) {
    console.error('Text error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/generate-photo', upload.single('photo'), async (req, res) => {
  try {
    const { subject, count } = req.body;
    const buffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'image/jpeg';
    
    if (!buffer) throw new Error('No photo uploaded');
    if (buffer.length > 4 * 1024 * 1024) {
      throw new Error('Photo too large. Max 4MB. Please compress or crop.');
    }
    
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    const prompt = `Read the lecture notes in this image and generate exactly ${count} multiple choice exam questions for "${subject}".

RULES:
- Exactly ${count} questions
- Each has 4 options: A, B, C, D
- Include correct answer index (0=A, 1=B, 2=C, 3=D)
- Include brief explanation

Return ONLY this JSON format:
[{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why"}]`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://exampro-ai-proxy.onrender.com',
        'X-Title': 'ExamPro AI'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        temperature: 0.3,
        max_tokens: 8192
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData.error?.message || `API error ${resp.status}`;
      
      if (resp.status === 429) {
        throw new Error('Rate limit hit. Wait 1 minute and try again.');
      }
      throw new Error(msg);
    }

    const data = await resp.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const questions = parseAIResponse(rawText);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('AI returned empty questions array');
    }
    
    res.json({ success: true, questions });
  } catch (err) {
    console.error('Photo error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy on port ${PORT} using OpenRouter`));
