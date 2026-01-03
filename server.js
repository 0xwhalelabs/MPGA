const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // 이미지 용량 제한 해제
app.use(express.static('public')); // public 폴더의 html 파일을 보여줌

// Gemini API 호출 라우트
app.post('/api/generate', async (req, res) => {
  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'API Key 없음' });

    const prompt = "This is a photo where a red baseball cap with 'MPGA' text has been digitally superimposed on a person. Fix the lighting, shadows, and color blending of the red cap to make it look 100% natural and realistic, as if the person is actually wearing it. Keep the person's face and background exactly the same, only blend the hat. High quality, photorealistic.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: image } }
            ]
          }],
          generationConfig: { responseModalities: ["IMAGE"] }
        })
      }
    );

    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    const generatedData = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    
    res.json({ success: true, image: generatedData });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
