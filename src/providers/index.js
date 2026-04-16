/**
 * Factory de fournisseurs IA
 * Selectionne le bon provider selon la config
 *
 * SOURCE UNIQUE DE VERITE pour les providers et modeles
 */

import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { MistralProvider } from './mistral.js';
import { OllamaProvider } from './ollama.js';

/**
 * Registre central — toute l'app utilise cette source
 */
export const PROVIDER_REGISTRY = {
  claude: {
    Class: ClaudeProvider,
    name: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250414'],
    envVar: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    icon: '🟣',
    needsKey: true,
  },
  openai: {
    Class: OpenAIProvider,
    name: 'ChatGPT (OpenAI)',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    envVar: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    icon: '🟢',
    needsKey: true,
  },
  mistral: {
    Class: MistralProvider,
    name: 'Mistral AI',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    envVar: 'MISTRAL_API_KEY',
    keyUrl: 'https://console.mistral.ai/api-keys',
    icon: '🟠',
    needsKey: true,
  },
  ollama: {
    Class: OllamaProvider,
    name: 'Ollama (local)',
    defaultModel: 'llama3.1',
    models: ['llama3.1', 'mistral', 'gemma2', 'phi3'],
    envVar: null,
    keyUrl: null,
    icon: '⚪',
    needsKey: false,
  },
};

// Alias
PROVIDER_REGISTRY.chatgpt = PROVIDER_REGISTRY.openai;

/**
 * Cree une instance du provider demande
 * @param {string} name - Nom du provider (claude, openai, mistral, ollama)
 * @param {object} options - Options (model, apiKey, etc.)
 * @returns {BaseProvider}
 */
export function createProvider(name, options = {}) {
  const entry = PROVIDER_REGISTRY[name.toLowerCase()];
  if (!entry || !entry.Class) {
    const available = Object.keys(PROVIDER_REGISTRY).filter(k => PROVIDER_REGISTRY[k].Class).join(', ');
    throw new Error(`Provider "${name}" inconnu. Disponibles : ${available}`);
  }
  return new entry.Class(options);
}

/**
 * Liste les providers (pour l'UI)
 */
export function listProviders() {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([id, entry]) => id !== 'chatgpt' && entry.Class) // exclure alias
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      models: entry.models,
      defaultModel: entry.defaultModel,
      icon: entry.icon,
      needsKey: entry.needsKey,
      envVar: entry.envVar,
      keyUrl: entry.keyUrl,
    }));
}

/**
 * Retourne les infos d'un provider
 */
export function getProviderInfo(id) {
  return PROVIDER_REGISTRY[id] || null;
}
