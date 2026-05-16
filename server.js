const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 🔒 GROQ API KEY - ONLY HERE, NEVER IN FRONTEND
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Verify key exists
if (!GROQ_API_KEY) {
  console.error('❌ ERROR: GROQ_API_KEY environment variable not set!');
  console.error('Set it in Render Dashboard → Environment');
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ExamPro AI Proxy (Groq) is running', keyConfigured: !!GROQ_API_KEY });
});

// Generate questions from TEXT notes
app.post('/api/generate-text', async (req, res) => {
  try {
    const { subject, count, notes } = req.body;
    
    const prompt = `You are an exam question generator for Nigerian university students. Generate exactly ${count} multiple choice questions based on these lecture notes for the course "${subject}".

STRICT RULES:
- Generate exactly ${count} questions
- Each question must have exactly 4 options (A, B, C, D)
- Distribute correct answers evenly across A, B, C, D
- Include a brief explanation for each correct answer
- Base questions ONLY on the provided notes

Respond with ONLY a JSON array, no markdown, no backticks, no extra text:
[
  {
    "q": "question text",
    "options": ["option A", "option B", "option C", "option D"],
    "answer": 0,
    "explanation": "brief explanation"
  }
]
(answer is 0-indexed: 0=A, 1=B, 2=C, 3=D)

LECTURE NOTES:
${notes}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 8192
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const clean = rawText.replace(/```json|```/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Could not parse AI response');
    }

    res.json({ success: true, questions: parsed });
  } catch (err) {
    console.error('Generate text error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate questions from PHOTO
app.post('/api/generate-photo', upload.single('photo'), async (req, res) => {
  try {
    const { subject, count } = req.body;
    const photoBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'image/jpeg';
    
    if (!photoBuffer) throw new Error('No photo uploaded');
    
    const base64 = photoBuffer.toString('base64');
    
    const prompt = `Read the notes in this image and generate exactly ${count} multiple choice questions for the course "${subject}". STRICT: 4 options each, even answer distribution, brief explanations. Output ONLY a JSON array.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
            ]
          }
        ],
        temperature: 0.4,
        max_tokens: 8192
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const clean = rawText.replace(/```json|```/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Could not parse AI response');
    }

    res.json({ success: true, questions: parsed });
  } catch (err) {
    console.error('Generate photo error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ExamPro AI Proxy (Groq) running on port ${PORT}`);
});
