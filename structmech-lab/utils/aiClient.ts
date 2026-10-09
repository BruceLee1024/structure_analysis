import { getAIModel } from './aiModels';
import { requestCompletion, type CompletionOptions } from './aiTransport';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning_content?: string;
}

export async function sendChatCompletion(messages: AIMessage[], options?: CompletionOptions): Promise<string> {
  return requestCompletion(getAIModel(), localStorage.getItem('ai_api_key') || '', messages, { maxTokens: 400, ...options });
}

export async function sendChatCompletionStream(messages: AIMessage[], onChunk: (delta: string) => void, options?: CompletionOptions): Promise<string> {
  return requestCompletion(getAIModel(), localStorage.getItem('ai_api_key') || '', messages, { maxTokens: 800, ...options }, onChunk);
}
