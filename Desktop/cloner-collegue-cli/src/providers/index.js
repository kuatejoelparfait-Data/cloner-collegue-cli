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
    contextWindow: 200000,
    outputMax: 8192,
    // Tarifs par million de tokens (USD)
    pricing: { input: 3.0, output: 15.0 },
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
    contextWindow: 128000,
    outputMax: 16384,
    pricing: { input: 2.5, output: 10.0 },
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
    contextWindow: 32000,
    outputMax: 8192,
    pricing: { input: 2.0, output: 6.0 },
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
    contextWindow: 8192,
    outputMax: 4096,
    pricing: { input: 0, output: 0 },
  },
};

// Alias
PROVIDER_REGISTRY.chatgpt = PROVIDER_REGISTRY.openai;

/**
 * Cree une instance du provider demande (synchrone)
 * La cle API doit etre dans options.apiKey, l'env, ou config.json plaintext.
 * Le keychain n'est PAS consulte (utiliser createProviderAsync pour ca).
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
 * Cree une instance du provider en resolvant la cle API depuis env > keychain > plaintext
 * A privilegier dans les CLI commands
 * @param {string} name
 * @param {object} options
 * @returns {Promise<BaseProvider>}
 */
export async function createProviderAsync(name, options = {}) {
  const entry = PROVIDER_REGISTRY[name.toLowerCase()];
  if (!entry || !entry.Class) {
    const available = Object.keys(PROVIDER_REGISTRY).filter(k => PROVIDER_REGISTRY[k].Class).join(', ');
    throw new Error(`Provider "${name}" inconnu. Disponibles : ${available}`);
  }

  // Si l'appelant a deja fourni la cle, ou si le provider n'en a pas besoin, on passe direct
  if (options.apiKey || !entry.needsKey) {
    return new entry.Class(options);
  }

  // Resolution : env > keychain > plaintext
  const { resolveApiKey } = await import('../utils/config.js');
  const apiKey = await resolveApiKey(name.toLowerCase());
  return new entry.Class({ ...options, apiKey: apiKey || undefined });
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
      contextWindow: entry.contextWindow,
      outputMax: entry.outputMax,
      pricing: entry.pricing,
    }));
}

/**
 * Retourne les infos d'un provider
 */
export function getProviderInfo(id) {
  return PROVIDER_REGISTRY[id] || null;
}
