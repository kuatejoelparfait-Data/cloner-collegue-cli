/**
 * Gestion de la configuration
 * Stocke les cles API et preferences dans ~/.cloner-collegue/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.cloner-collegue');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Import dynamique pour eviter les imports circulaires
let _registry = null;
function getRegistry() {
  if (!_registry) {
    // Valeurs par defaut embarquees (fallback si import echoue)
    _registry = {
      claude: { defaultModel: 'claude-sonnet-4-20250514', needsKey: true },
      openai: { defaultModel: 'gpt-4o', needsKey: true },
      mistral: { defaultModel: 'mistral-large-latest', needsKey: true },
      ollama: { defaultModel: 'llama3.1', needsKey: false },
    };
  }
  return _registry;
}

function buildDefaultConfig() {
  const reg = getRegistry();
  return {
    defaultProvider: 'claude',
    language: 'fr',
    providers: {
      claude: { apiKey: '', model: reg.claude.defaultModel },
      openai: { apiKey: '', model: reg.openai.defaultModel },
      mistral: { apiKey: '', model: reg.mistral.defaultModel },
      ollama: { baseURL: 'http://localhost:11434/v1', model: reg.ollama.defaultModel },
    },
  };
}

const DEFAULT_CONFIG = buildDefaultConfig();

/**
 * Charge la config depuis le disque ou retourne les valeurs par defaut
 */
export function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Config corrompue — utiliser les defauts
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Ecrit une valeur dans la config
 * Supporte la notation pointee : "claude.apiKey" -> config.providers.claude.apiKey
 */
export function setConfig(key, value) {
  const config = getConfig();

  // Gerer la notation pointee pour les providers
  const parts = key.split('.');
  if (parts.length === 2) {
    const [provider, field] = parts;
    if (config.providers[provider]) {
      config.providers[provider][field] = value;
    } else {
      config[key] = value;
    }
  } else {
    config[key] = value;
  }

  // Creer le dossier si necessaire
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}

/**
 * Retourne le chemin du dossier de config
 */
export function getConfigDir() {
  return CONFIG_DIR;
}

/**
 * Verifie si le provider actif a une cle API configuree
 * @returns {{ ok: boolean, provider: string, needsKey: boolean }}
 */
export function checkApiKey() {
  const config = getConfig();
  const provider = config.defaultProvider || 'claude';

  // Ollama n'a pas besoin de cle
  if (provider === 'ollama') return { ok: true, provider, needsKey: false };

  const key = config.providers?.[provider]?.apiKey || '';

  // Verifier aussi les variables d'environnement
  const envVar = {
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  }[provider];

  const envKey = process.env[envVar] || '';

  return {
    ok: !!(key.trim() || envKey.trim()),
    provider,
    needsKey: true,
  };
}
