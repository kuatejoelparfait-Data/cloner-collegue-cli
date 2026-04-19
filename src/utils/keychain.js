/**
 * Coffre securise pour les cles API
 * Utilise keytar pour stocker dans le trousseau du systeme :
 *   - macOS : Keychain
 *   - Windows : Credential Vault
 *   - Linux : libsecret (gnome-keyring, kwallet)
 *
 * Fallback : si keytar est indisponible (libsecret manquant sur Linux,
 * ou module natif cassé), on degrade vers config.json en plaintext avec avertissement.
 *
 * Les cles sont accessibles :
 * 1. via les variables d'environnement (priorite la plus haute — CI/scripts)
 * 2. via le keychain (stockage par defaut)
 * 3. via config.json en clair (fallback/migration)
 */

import { ui } from './ui.js';

const SERVICE_NAME = 'cloner-collegue';

// Lazy load : keytar utilise du code natif qui peut echouer au require
let _keytar = null;
let _keytarStatus = null; // 'ok' | 'unavailable'

async function getKeytar() {
  if (_keytarStatus === 'unavailable') return null;
  if (_keytar) return _keytar;

  try {
    _keytar = (await import('keytar')).default;
    // Test minimal que le module fonctionne
    await _keytar.findCredentials(SERVICE_NAME);
    _keytarStatus = 'ok';
    return _keytar;
  } catch (err) {
    _keytarStatus = 'unavailable';
    if (process.env.DEBUG) {
      console.error('[keychain] keytar indisponible:', err.message);
    }
    return null;
  }
}

/**
 * Stocke une cle API dans le trousseau systeme
 * @param {string} provider - Nom du provider (claude, openai, mistral)
 * @param {string} apiKey
 * @returns {Promise<{ok: boolean, storage: 'keychain'|'unavailable', error?: string}>}
 */
export async function saveApiKey(provider, apiKey) {
  const keytar = await getKeytar();
  if (!keytar) {
    return { ok: false, storage: 'unavailable', error: 'keytar indisponible sur ce systeme' };
  }

  try {
    await keytar.setPassword(SERVICE_NAME, provider, apiKey);
    return { ok: true, storage: 'keychain' };
  } catch (err) {
    return { ok: false, storage: 'unavailable', error: err.message };
  }
}

/**
 * Lit une cle API depuis le trousseau systeme
 * @returns {Promise<string|null>}
 */
export async function getApiKey(provider) {
  const keytar = await getKeytar();
  if (!keytar) return null;

  try {
    return await keytar.getPassword(SERVICE_NAME, provider);
  } catch (err) {
    if (process.env.DEBUG) {
      console.error(`[keychain] getPassword failed for ${provider}:`, err.message);
    }
    return null;
  }
}

/**
 * Supprime une cle API du trousseau
 */
export async function deleteApiKey(provider) {
  const keytar = await getKeytar();
  if (!keytar) return false;

  try {
    return await keytar.deletePassword(SERVICE_NAME, provider);
  } catch {
    return false;
  }
}

/**
 * Liste les providers ayant une cle stockee
 * @returns {Promise<string[]>}
 */
export async function listStoredProviders() {
  const keytar = await getKeytar();
  if (!keytar) return [];

  try {
    const creds = await keytar.findCredentials(SERVICE_NAME);
    return creds.map(c => c.account);
  } catch {
    return [];
  }
}

/**
 * Indique si le trousseau systeme est disponible
 */
export async function isKeychainAvailable() {
  const keytar = await getKeytar();
  return keytar !== null;
}

/**
 * Migration : deplace les cles en plaintext de config.json vers le keychain
 * Appele au demarrage de maniere idempotente
 *
 * @param {object} config - Config complete chargee depuis config.json
 * @returns {Promise<{migrated: string[], failed: string[]}>}
 */
export async function migratePlaintextKeys(config) {
  const migrated = [];
  const failed = [];

  if (!config?.providers) return { migrated, failed };

  const available = await isKeychainAvailable();
  if (!available) return { migrated, failed };

  for (const [provider, settings] of Object.entries(config.providers)) {
    const plainKey = settings?.apiKey;
    if (!plainKey || !plainKey.trim()) continue;

    const existing = await getApiKey(provider);
    if (existing) {
      // Deja dans le keychain : on vide juste le plaintext
      settings.apiKey = '';
      continue;
    }

    const result = await saveApiKey(provider, plainKey.trim());
    if (result.ok) {
      settings.apiKey = ''; // On vide la version plaintext
      migrated.push(provider);
    } else {
      failed.push(provider);
    }
  }

  return { migrated, failed };
}

/**
 * Affiche un avertissement si le fallback plaintext est utilise
 */
export async function warnIfPlaintext() {
  const available = await isKeychainAvailable();
  if (!available) {
    ui.warn('Trousseau systeme indisponible — les cles sont stockees en clair dans config.json.');
    ui.info('Sur Linux : installe libsecret (apt install libsecret-1-dev / dnf install libsecret-devel).');
  }
}
