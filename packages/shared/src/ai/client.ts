import OpenAI from 'openai';
import type { AIModel } from '../constants/models';

let _client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _client;
}

/** Simple completion — returns text string */
export async function aiComplete(opts: {
  model: AIModel;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const client = getAIClient();
  const response = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 300,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt },
    ],
  });
  return response.choices[0]?.message?.content || '';
}

/** JSON completion — returns parsed object */
export async function aiJSON<T = any>(opts: {
  model: AIModel;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T | null> {
  const client = getAIClient();
  const response = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: opts.system + '\n\nAlways respond with valid JSON.' },
      { role: 'user', content: opts.prompt },
    ],
  });

  const text = response.choices[0]?.message?.content || '';
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Streaming completion — returns AsyncIterable of text chunks */
export async function aiStream(opts: {
  model: AIModel;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}) {
  const client = getAIClient();
  return client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 300,
    stream: true,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages,
    ],
  });
}
