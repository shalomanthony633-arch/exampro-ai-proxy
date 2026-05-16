
# Read the current server.js
with open('/mnt/agents/output/server.js', 'r') as f:
    backend = f.read()

# Add better logging to see what Gemini actually returns
old_photo_error = """  } catch (err) {
    console.error('Generate photo error:', err);
    res.status(500).json({ success: false, error: err.message });
  }"""

new_photo_error = """  } catch (err) {
    console.error('Generate photo error:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ success: false, error: err.message });
  }"""

backend = backend.replace(old_photo_error, new_photo_error)

# Also add logging for the raw response before parsing
old_photo_data = """    const data = await response.json();
    let rawText = '';"""

new_photo_data = """    const data = await response.json();
    console.log('Gemini response keys:', Object.keys(data));
    if (data.candidates) console.log('Candidates count:', data.candidates.length);
    let rawText = '';"""

backend = backend.replace(old_photo_data, new_photo_data)

# Same for text
old_text_data = """    const data = await response.json();
    let rawText = '';"""

new_text_data = """    const data = await response.json();
    console.log('Gemini response keys:', Object.keys(data));
    if (data.candidates) console.log('Candidates count:', data.candidates.length);
    let rawText = '';"""

backend = backend.replace(old_text_data, new_text_data)

with open('/mnt/agents/output/server.js', 'w') as f:
    f.write(backend)

print("✅ Added debug logging to backend")
