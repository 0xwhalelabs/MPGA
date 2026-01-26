require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));

const defaultHatUrl = 'https://raw.githubusercontent.com/0xwhalelabs/MPGA/main/hat.png';
const hatUrl = process.env.HAT_URL || defaultHatUrl;
let hatCache = null;
let hatCacheError = null;

async function getHatPngBuffer() {
  if (hatCache) return hatCache;
  if (hatCacheError) throw hatCacheError;

  try {
    const res = await fetch(hatUrl);
    if (!res.ok) {
      throw new Error(`hat_fetch_failed: ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    hatCache = buf;
    return buf;
  } catch (e) {
    hatCacheError = e;
    throw e;
  }
}

app.get('/assets/hat.png', async (req, res) => {
  try {
    const buf = await getHatPngBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: 'hat_unavailable', detail: String(e?.message || e) });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { image, mimeType, prompt } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server: API Key not configured' });
    }

    if (!image) {
      return res.status(400).json({ error: 'image is required' });
    }

    const mt = String(mimeType || 'image/jpeg');
    const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-image');
    const finalPrompt = String(prompt || '').trim();
    if (!finalPrompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: finalPrompt },
              { inlineData: { mimeType: mt, data: image } }
            ]
          }
        ],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Gemini API Error', detail: errText });
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p?.inlineData?.data);

    if (imagePart?.inlineData?.data) {
      return res.json({ success: true, image: imagePart.inlineData.data });
    }

    return res.status(500).json({ error: 'No image generated in response', detail: result });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function toBase64(buffer) {
  return buffer.toString('base64');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fallbackPlacement({ width, height }) {
  const cx = width * 0.5;
  const cy = height * 0.18;
  const hatWidth = width * 0.6;
  const angleDeg = 0;
  return {
    centerX: cx,
    centerY: cy,
    hatWidth,
    angleDeg,
    confidence: 0.2,
    note: 'fallback'
  };
}

async function geminiPlacement({ imageBase64, mimeType, width, height }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = String(process.env.GEMINI_MODEL || 'gemini-1.5-flash');
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are an image analysis assistant.
Return ONLY a minified JSON object with this schema:
{
  "centerX": number,
  "centerY": number,
  "hatWidth": number,
  "angleDeg": number,
  "confidence": number
}

Goal: place a pre-made hat PNG naturally on the person's head.
- centerX, centerY are pixel coordinates in the original image.
- hatWidth is the desired rendered hat width in pixels.
- angleDeg is clockwise rotation in degrees to match head tilt.

If no face is visible, return confidence 0 and still provide a reasonable guess.
Image size: width=${width}, height=${height}.
`;

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        data: imageBase64,
        mimeType
      }
    }
  ]);

  const text = result.response.text().trim();

  let jsonText = text;
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(jsonText);

  const centerX = clamp(Number(parsed.centerX), 0, width);
  const centerY = clamp(Number(parsed.centerY), 0, height);
  const hatWidth = clamp(Number(parsed.hatWidth), width * 0.15, width * 0.95);
  const angleDeg = clamp(Number(parsed.angleDeg), -45, 45);
  const confidence = clamp(Number(parsed.confidence), 0, 1);

  return { centerX, centerY, hatWidth, angleDeg, confidence };
}

app.post('/api/hat-placement', upload.single('image'), async (req, res) => {
  try {
    const { width, height, mimeType } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'image is required' });
    }

    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return res.status(400).json({ error: 'width/height are required' });
    }

    const mt = String(mimeType || req.file.mimetype || 'image/jpeg');

    const imageBase64 = toBase64(req.file.buffer);

    try {
      const gemini = await geminiPlacement({ imageBase64, mimeType: mt, width: w, height: h });
      if (gemini) {
        return res.json({ ...gemini, note: 'gemini' });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('geminiPlacement_failed', e?.message || e);
    }

    return res.json(fallbackPlacement({ width: w, height: h }));
  } catch (err) {
    return res.status(500).json({ error: 'failed_to_estimate', detail: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT || 5177);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MPGA Generator running on http://localhost:${port}`);
});
