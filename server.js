
# Read the current server.js
with open('/mnt/agents/output/server.js', 'r') as f:
    backend = f.read()

# Replace the parsing logic with a more robust version that handles edge cases
old_parse = """    let rawText = '';
    
    // Handle different Gemini response formats
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts) {
        rawText = candidate.content.parts.map(p => p.text || '').join('');
      } else if (candidate.output) {
        rawText = candidate.output;
      }
    }
    
    if (!rawText) throw new Error('Empty response from AI');
    
    // Clean up the response
    let clean = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Remove any text before [ and after ]
    const startIdx = clean.indexOf('[');
    const endIdx = clean.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      clean = clean.substring(startIdx, endIdx + 1);
    }
    
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('Parse error, raw text:', rawText.substring(0, 500));
      throw new Error('Could not parse AI response as JSON: ' + e.message);
    }"""

new_parse = """    let rawText = '';
    
    // Handle different Gemini response formats
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts) {
        rawText = candidate.content.parts.map(p => p.text || '').join('');
      } else if (candidate.output) {
        rawText = candidate.output;
      }
    }
    
    if (!rawText) throw new Error('Empty response from AI');
    
    console.log('Raw AI response (first 300 chars):', rawText.substring(0, 300));
    
    // Clean up the response - remove markdown code blocks
    let clean = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .replace(/^\s*json\s*/i, '')
      .trim();
    
    // Find the JSON array - look for [ ... ]
    const startIdx = clean.indexOf('[');
    const endIdx = clean.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      clean = clean.substring(startIdx, endIdx + 1);
    }
    
    // Also try to find array if wrapped in other text
    if (!clean.startsWith('[')) {
      const arrayMatch = rawText.match(/\[\s*\{\s*"q"\s*:/);
      if (arrayMatch) {
        const start = rawText.indexOf('[');
        const end = rawText.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          clean = rawText.substring(start, end + 1);
        }
      }
    }
    
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('First parse failed, trying alternative...');
      // Try to extract anything that looks like JSON array
      const fallbackMatch = rawText.match(/\[[\s\S]*?\]/);
      if (fallbackMatch) {
        try {
          parsed = JSON.parse(fallbackMatch[0]);
          console.log('Fallback parse succeeded');
        } catch (e2) {
          console.error('Fallback also failed');
          throw new Error('Could not parse AI response as JSON');
        }
      } else {
        throw new Error('Could not parse AI response as JSON');
      }
    }"""

backend = backend.replace(old_parse, new_parse)

# Save
with open('/mnt/agents/output/server.js', 'w') as f:
    f.write(backend)

print("✅ Backend parsing improved")
print("Handles markdown blocks:", '```json' in backend)
print("Has fallback parsing:", 'fallbackMatch' in backend)
