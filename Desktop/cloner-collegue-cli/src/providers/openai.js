/**
 * Provider OpenAI (ChatGPT, GPT-4, etc.)
 */

import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import { getConfig } from '../utils/config.js';

const RETRY_DELAY_MS = 5000;

export class OpenAIProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    const config = getConfig();
    this.apiKey = options.apiKey || config.providers?.openai?.apiKey || process.env.OPENAI_API_KEY;

    if (!this.apiKey) {
      throw new Error(
        'Cle API OpenAI manquante. Configure-la avec :\n' +
        '  cloner config --set openai.apiKey=sk-...\n' +
        '  ou definis OPENAI_API_KEY dans ton .env'
      );
    }

    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  get name() { return 'ChatGPT'; }
  get defaultModel() { return 'gpt-4o'; }

  async complete(systemPrompt, userMessage, options = {}) {
    return this._callWithRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      return BaseProvider.safeExtractText(response, 'openai');
    });
  }

  async chat(systemPrompt, messages, options = {}) {
    return this._callWithRetry(async () => {
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      const response = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        messages: formattedMessages,
      });

      return BaseProvider.safeExtractText(response, 'openai');
    });
  }

  async *stream(systemPrompt, messages, options = {}) {
    try {
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      const stream = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        messages: formattedMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      BaseProvider.handleApiError(error, this.name);
    }
  }

  async completeStream(systemPrompt, userMessage, options = {}, onChunk) {
    const messages = [{ role: 'user', content: userMessage }];
    let fullText = '';

    for await (const chunk of this.stream(systemPrompt, messages, options)) {
      fullText += chunk;
      if (onChunk) {
        onChunk(chunk);
      }
    }

    return fullText;
  }

  /**
   * Execute un appel API avec 1 retry automatique sur erreur 429
   */
  async _callWithRetry(fn) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.response?.status;

      if (status === 429) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        try {
          return await fn();
        } catch (retryError) {
          BaseProvider.handleApiError(retryError, this.name);
        }
      }

      BaseProvider.handleApiError(error, this.name);
    }
  }
}
