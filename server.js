const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

app.post('/api/generate', async (req, res) => {
  try {
    const { photo, hat, placement } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    if (!photo || !hat) return res.status(400).json({ error: 'photo and hat are required' });

    const { x, y, scale, rotation } = placement || {};

    // ✅ 프롬프트: "새로 그리기" 금지 + "주황/텍스트" 유지 + "각도/그림자/가림"만
    const prompt = `
You are a professional photo compositor/editor.
You will receive:
(1) PHOTO = the original user photo
(2) HAT = the exact hat PNG (with text already baked in)

TASK:
Place the provided HAT onto the person's head in PHOTO at the given placement,
and make it look naturally worn.

PLACEMENT (relative to PHOTO, 0..1):
- Anchor point on head: x=${x ?? 0.5}, y=${y ?? 0.2}
- Scale: ${scale ?? 0.35}
- Rotation (degrees): ${rotation ?? 0}

ABSOLUTE RULES (MUST FOLLOW):
1) Use the provided HAT image design exactly. Do NOT redraw the hat, do NOT change the logo/text.
2) Keep the hat color as bright orange (do not shift hue). Preserve saturation and brightness.
3) Do NOT turn the photo into an illustration/cartoon/character. Keep it photorealistic.
4) Preserve the person's face, identity, and the background. Only edit where necessary for the hat.
5) Make it natural: match perspective, curve/warp to head roundness, add realistic contact shadows.
6) Add occlusion: if hair/forehead should cover parts of the hat edge, do it subtly.

Output: One edited image only.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: photo } }, // PHOTO
              { inlineData: { mimeType: "image/png", data: hat } }      // HAT
            ]
          }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            temperature: 0
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Gemini API Error ${response.status}: ${errText}` });
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.data);

    if (!imagePart) return res.status(500).json({ error: 'No image generated in response' });

    res.json({ success: true, image: imagePart.inlineData.data });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
