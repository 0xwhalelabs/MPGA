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
    // 텍스트 내용을 강제하고, 머리 굴곡에 맞춘 자연스러운 합성을 지시합니다.
    const prompt = `
      TASK: Professional Photo Compositing.
      INPUT: An image where a Orange cap is overlaying a person's head.
      GOAL: Make the hat look 100% naturally worn by the person with specific text.

      CRITICAL REQUIREMENTS (MUST FOLLOW):
      1. [TEXT ENFORCEMENT]: The text on the front of the hat MUST be clear and readable in exactly two lines:
         Line 1: MAKE $PUP
         Line 2: GREAT AGAIN
         (If the text is blurry or different, FIX it to match this exactly in white bold font).
      2. [NATURAL FIT & WARP]: The hat must NOT look flat. Visually 'warp' and curve the hat to match the roundness of the person's head.
      3. [LIGHTING & SHADOWS]: Add realistic contact shadows on the forehead where the hat sits. Match the lighting direction of the scene.
      4. [COLOR]: Keep the hat ORANGE.
      5. [PRESERVATION]: Do not change the person's face features or the background.

      SUMMARY: Orange hat with text "MAKE $PUP" (top) and "GREAT AGAIN" (bottom), realistically fitted on head.
    `;

    console.log("🚀 Gemini API에 요청 보냄 (프롬프트: 텍스트 지정 & 피팅 강화)...");
    
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
          // 텍스트 수정을 위해 이미지 모드 사용
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
