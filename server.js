const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not set');
}

app.get('/', (req, res) => {
  res.json({ status: 'Running', keyConfigured: !!GEMINI_API_KEY });
});

function parseResponse(data) {
  let text = '';
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    text = data.candidates[0].content.parts.map(p => p.text || '').join('');
  }
  if (!text) throw new Error('Empty AI response');
  
  // Clean markdown
  text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // Find JSON array
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    text = text.substring(start, end + 1);
  }
  
  return JSON.parse(text);
}

app.post('/api/generate-text', async (req, res) => {
  try {
    const { subject, count, notes } = req.body;
    const prompt = `Generate exactly ${count} MCQ questions for "${subject}" from these notes. Each with 4 options (A,B,C,D), correct answer index (0-3), and explanation. Return ONLY JSON array: [{"q":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]

NOTES: ${notes}`;

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.4 }
      })
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    const parsed = parseResponse(data);
    res.json({ success: true, questions: parsed });
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
    if (!buffer) throw new Error('No photo');
    
    const base64 = buffer.toString('base64');
    const prompt = `Generate exactly ${count} MCQ questions from this image for "${subject}". Each with 4 options, correct answer index, explanation. Return ONLY JSON array.`;

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          role: 'user', 
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt }
          ] 
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.4 }
      })
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    const parsed = parseResponse(data);
    res.json({ success: true, questions: parsed });
  } catch (err) {
    console.error('Photo error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy on port ${PORT}`));
