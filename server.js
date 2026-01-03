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
  console.log("📷 이미지 생성 요청 받음");

  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("❌ 오류: Railway 변수에 GEMINI_API_KEY가 설정되지 않았습니다.");
      return res.status(500).json({ error: 'Server: API Key not configured' });
    }

    // --- 프롬프트 수정 핵심 ---
    // 6번 규칙 추가: 머리 크기에 맞게 모자 크기/각도 조절
    const prompt = `
      This is a photo composite where a red baseball cap with 'MPGA' text has been placed on a person.
      Your goal is to make this composite look 100% realistic without changing the hat's design.
      
      STRICT RULES:
      1. DO NOT change, blur, or regenerate the 'MPGA' text on the hat. It MUST remain legible and sharp.
      2. DO NOT change the shape or red color of the hat.
      3. ONLY adjust the lighting and shadows on the hat to match the person's environment.
      4. Blend the edges of the hat naturally with the person's hair or head.
      5. Keep the person's face and background 100% identical to the original.
      6. Adjust the size, scale, and perspective of the hat slightly to ensure it fits the person's head size and angle perfectly.
      
      Output: A high-quality, photorealistic image.
    `;

    console.log("🚀 Gemini API에 요청 보냄 (프롬프트 강화됨)...");
    
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
          // 텍스트 변형을 막기 위해 이미지 모드 강조
          generationConfig: { responseModalities: ["IMAGE"] }
        })
      }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Gemini API 응답 오류 (${response.status}):`, errText);
        throw new Error(`Gemini API Error: ${response.status} ${errText}`);
    }

    const result = await response.json();
    console.log("✅ Gemini 응답 성공");

    const candidates = result.candidates?.[0]?.content?.parts;
    const imagePart = candidates?.find(p => p.inlineData);

    if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
      console.log("🖼️ 이미지 데이터 추출 성공");
      res.json({ success: true, image: imagePart.inlineData.data });
    } else {
      console.error("⚠️ 응답에 이미지가 없습니다.");
      res.status(500).json({ error: 'No image generated in response' });
    }

  } catch (error) {
    console.error("🔥 서버 내부 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
