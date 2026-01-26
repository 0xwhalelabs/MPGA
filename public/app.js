const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusText = document.getElementById('statusText');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let sourceFile = null;
let sourceImage = null;
let hatImage = null;

function setStatus(text) {
  statusText.textContent = text;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function loadHat() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = '/assets/hat.png';
  });
}

function drawBaseImage(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
}

function drawHat({ centerX, centerY, hatWidth, angleDeg }) {
  if (!hatImage) return;
  const scale = hatWidth / hatImage.naturalWidth;
  const hatH = hatImage.naturalHeight * scale;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((angleDeg * Math.PI) / 180);

  const x = -hatWidth / 2;
  const y = -hatH * 0.8;

  ctx.drawImage(hatImage, x, y, hatWidth, hatH);
  ctx.restore();
}

async function requestPlacement(file, width, height, mimeType) {
  const form = new FormData();
  form.append('image', file);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('mimeType', String(mimeType || file.type || 'image/jpeg'));

  const res = await fetch('/api/hat-placement', { method: 'POST', body: form });
  if (!res.ok) {
    const ct = String(res.headers.get('content-type') || '');
    if (ct.includes('application/json')) {
      const json = await res.json();
      const msg = json?.detail || json?.error || 'request_failed';
      throw new Error(String(msg));
    }
    const msg = await res.text();
    throw new Error(String(msg || 'request_failed'));
  }
  return res.json();
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  sourceFile = file || null;
  downloadBtn.disabled = true;

  if (!file) {
    fileName.textContent = '선택된 파일 없음';
    generateBtn.disabled = true;
    setStatus('대기 중');
    return;
  }

  fileName.textContent = file.name;
  setStatus('이미지 로딩 중...');

  try {
    sourceImage = await loadImageFromFile(file);
    drawBaseImage(sourceImage);
    generateBtn.disabled = false;
    setStatus('준비 완료');
  } catch {
    sourceImage = null;
    generateBtn.disabled = true;
    setStatus('이미지 로딩 실패');
  }
});

generateBtn.addEventListener('click', async () => {
  if (!sourceFile || !sourceImage) return;

  generateBtn.disabled = true;
  downloadBtn.disabled = true;

  setStatus('모자 이미지 로딩 중...');
  try {
    hatImage = await loadHat();
  } catch {
    setStatus('hat.png를 찾을 수 없습니다. public/assets/hat.png에 파일을 넣어주세요.');
    generateBtn.disabled = false;
    return;
  }

  setStatus('머리 위치 추정 중...');

  try {
    const placement = await requestPlacement(
      sourceFile,
      sourceImage.naturalWidth,
      sourceImage.naturalHeight,
      sourceFile.type
    );

    drawBaseImage(sourceImage);
    drawHat(placement);

    downloadBtn.disabled = false;
    setStatus(`완료 (mode: ${placement.note || 'unknown'}, confidence: ${Number(placement.confidence).toFixed(2)})`);
  } catch (e) {
    drawBaseImage(sourceImage);
    setStatus(`추정 실패: ${String(e?.message || e)}`);
  } finally {
    generateBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = 'mpga.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});
