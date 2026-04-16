/**
 * Provider Anthropic Claude
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';
import { getConfig } from '../utils/config.js';

const RETRY_DELAY_MS = 5000;

export class ClaudeProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    const config = getConfig();
    this.apiKey = options.apiKey || config.providers?.claude?.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!this.apiKey) {
      throw new Error(
        'Cle API Anthropic manquante. Configure-la avec :\n' +
        '  cloner config --set claude.apiKey=sk-ant-...\n' +
        '  ou definis ANTHROPIC_API_KEY dans ton .env'
      );
    }

    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  get name() { return 'Claude'; }
  get defaultModel() { return 'claude-sonnet-4-20250514'; }

  async complete(systemPrompt, userMessage, options = {}) {
    return this._callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      return BaseProvider.safeExtractText(response, 'anthropic');
    });
  }

  async chat(systemPrompt, messages, options = {}) {
    return this._callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        system: systemPrompt,
        messages: messages,
      });

      return BaseProvider.safeExtractText(response, 'anthropic');
    });
  }

  async *stream(systemPrompt, messages, options = {}) {
    try {
      const stream = this.client.messages.stream({
        model: this.model || this.defaultModel,
        max_tokens: options.maxTokens || 4096,
        system: systemPrompt,
        messages: messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          yield event.delta.text;
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
        // Retry une fois apres un delai
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
