/**
 * Provider Ollama (modeles locaux)
 * Utilise l'API REST locale d'Ollama (compatible OpenAI)
 */

import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import { getConfig } from '../utils/config.js';

const OLLAMA_NOT_RUNNING_MSG =
  'Ollama n\'est pas lance ou inaccessible. Demarre-le avec :\n' +
  '  ollama serve\n\n' +
  'Puis telecharge un modele :\n' +
  '  ollama pull llama3.1';

export class OllamaProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    const config = getConfig();
    this.baseURL = options.baseURL || config.providers?.ollama?.baseURL || process.env.OLLAMA_URL || 'http://localhost:11434/v1';

    // Ollama ne necessite pas de cle API
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: this.baseURL,
    });
  }

  get name() { return 'Ollama (local)'; }
  get defaultModel() { return 'llama3.1'; }

  async complete(systemPrompt, userMessage, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      return BaseProvider.safeExtractText(response, 'openai');
    } catch (error) {
      this._handleOllamaError(error);
    }
  }

  async chat(systemPrompt, messages, options = {}) {
    try {
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      const response = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
        messages: formattedMessages,
      });

      return BaseProvider.safeExtractText(response, 'openai');
    } catch (error) {
      this._handleOllamaError(error);
    }
  }

  async *stream(systemPrompt, messages, options = {}) {
    try {
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      const stream = await this.client.chat.completions.create({
        model: this.model || this.defaultModel,
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
      this._handleOllamaError(error);
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
   * Gestion specifique des erreurs Ollama (connexion locale)
   * Delegue au handler generique pour les erreurs non-reseau
   */
  _handleOllamaError(error) {
    const code = error?.code || error?.cause?.code;

    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT'
        || code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.message?.includes('fetch failed')) {
      throw new Error(OLLAMA_NOT_RUNNING_MSG);
    }

    // Pour les autres erreurs, utiliser le handler generique
    BaseProvider.handleApiError(error, this.name);
  }
}
