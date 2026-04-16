import { VISION_MODELS } from './aiModels';

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MultimodalContentPart[];
}

function getVisionConfig() {
  const apiKey = localStorage.getItem('vision_api_key');
  const modelId = localStorage.getItem('vision_model') || 'kimi-k2.5';
  const model = VISION_MODELS.find(item => item.id === modelId) || VISION_MODELS[0];
  return { apiKey, model };
}

export function isVisionConfigured(): boolean {
  const { apiKey } = getVisionConfig();
  return Boolean(apiKey);
}

export function getVisionModelName(): string {
  const { model } = getVisionConfig();
  return model.name;
}

export function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('读取文件失败'));
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageIfNeeded(
  dataUrl: string,
  maxSizeBytes: number = 4 * 1024 * 1024,
): Promise<string> {
  const sizeEstimate = Math.ceil(dataUrl.length * 0.75);
  if (sizeEstimate <= maxSizeBytes) return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.sqrt(maxSizeBytes / sizeEstimate);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 不可用')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

export async function enhanceImageForRecognition(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2048;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 不可用')); return; }

      // Light enhancement: boost contrast + sharpen, keep colors intact
      ctx.filter = 'contrast(1.3) brightness(1.05)';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = 'none';

      // Unsharp mask for mild sharpening
      const canvas2 = document.createElement('canvas');
      canvas2.width = w;
      canvas2.height = h;
      const ctx2 = canvas2.getContext('2d');
      if (ctx2) {
        ctx2.filter = 'blur(1px)';
        ctx2.drawImage(canvas, 0, 0);
        const original = ctx.getImageData(0, 0, w, h);
        const blurred = ctx2.getImageData(0, 0, w, h);
        const od = original.data;
        const bd = blurred.data;
        const amount = 0.4;
        for (let i = 0; i < od.length; i += 4) {
          od[i] = Math.max(0, Math.min(255, Math.round(od[i] + (od[i] - bd[i]) * amount)));
          od[i + 1] = Math.max(0, Math.min(255, Math.round(od[i + 1] + (od[i + 1] - bd[i + 1]) * amount)));
          od[i + 2] = Math.max(0, Math.min(255, Math.round(od[i + 2] + (od[i + 2] - bd[i + 2]) * amount)));
        }
        ctx.putImageData(original, 0, 0);
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

export async function addCoordinateGrid(dataUrl: string): Promise<{ url: string; cols: number; rows: number; cellW: number; cellH: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2048;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 不可用')); return; }

      // Draw original image with light contrast boost
      ctx.filter = 'contrast(1.2) brightness(1.05)';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = 'none';

      // Calculate grid: aim for ~50px per cell, min 6 cols/rows
      const targetCellSize = 50;
      const cols = Math.max(6, Math.round(w / targetCellSize));
      const rows = Math.max(4, Math.round(h / targetCellSize));
      const cellW = w / cols;
      const cellH = h / rows;

      // Draw grid lines
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= cols; c++) {
        const x = Math.round(c * cellW);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        const y = Math.round(r * cellH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Label columns (1,2,3...) at top
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let c = 0; c <= cols; c++) {
        const x = Math.round(c * cellW);
        const label = String(c);
        // Background for readability
        const tw = ctx.measureText(label).width + 4;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x - tw / 2, 0, tw, 14);
        ctx.fillStyle = '#00e0ff';
        ctx.fillText(label, x, 1);
      }

      // Label rows (A,B,C...) at left, from top to bottom
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let r = 0; r <= rows; r++) {
        const y = Math.round(r * cellH);
        const label = String.fromCharCode(65 + r); // A, B, C, ...
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, y - 7, 14, 14);
        ctx.fillStyle = '#00e0ff';
        ctx.fillText(label, 2, y);
      }

      // Draw intersection dots for clarity
      ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
          ctx.beginPath();
          ctx.arc(Math.round(c * cellW), Math.round(r * cellH), 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      resolve({ url: canvas.toDataURL('image/png'), cols, rows, cellW, cellH });
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

export async function sendVisionCompletion(
  messages: VisionMessage[],
  options?: { maxTokens?: number },
): Promise<string> {
  const { apiKey, model } = getVisionConfig();

  if (!apiKey) {
    throw new Error('未配置视觉模型 API Key，请在设置中配置');
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: options?.maxTokens ?? 2000,
      thinking: { type: 'disabled' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`视觉模型 API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message;
  return msg?.content ?? msg?.reasoning_content ?? '';
}

export async function sendVisionCompletionStream(
  messages: VisionMessage[],
  onChunk: (delta: string) => void,
  options?: { maxTokens?: number },
): Promise<string> {
  const { apiKey, model } = getVisionConfig();

  if (!apiKey) {
    throw new Error('未配置视觉模型 API Key，请在设置中配置');
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: options?.maxTokens ?? 2000,
      thinking: { type: 'disabled' },
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`视觉模型 API 错误 (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前视觉模型不支持流式输出');

  const decoder = new TextDecoder();
  let accumulated = '';
  let done = false;

  while (!done) {
    const { done: chunkDone, value } = await reader.read();
    done = chunkDone;
    if (!value) continue;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') { done = true; break; }
      try {
        const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          accumulated += delta;
          onChunk(delta);
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  return accumulated;
}
