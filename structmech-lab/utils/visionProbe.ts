import type { VisionMessage } from './visionClient';

// 仅发送内置红色方块，不使用用户上传的结构图片。
export const VISION_PROBE_MESSAGES: VisionMessage[] = [{
  role: 'user',
  content: [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKElEQVR4nO3NsQ0AAAzCMP5/un0CNkuZ41wybXsHAAAAAAAAAAAAxR4yw/wuPL6QkAAAAABJRU5ErkJggg==' } },
    { type: 'text', text: '图片中的方块是什么颜色？只回答颜色名称。' },
  ],
}];

export function isVisionProbeAnswer(answer: string): boolean {
  return /红|red/i.test(answer);
}
