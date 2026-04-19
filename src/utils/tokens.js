/**
 * Utilitaires d'estimation de tokens et de capacite de contexte
 * Approximation simple : 1 token ≈ 0.75 mot (ratio inverse : 1.33 tokens/mot)
 */

const TOKENS_PER_WORD = 1.33;

/**
 * Estime le nombre de tokens d'un texte
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * TOKENS_PER_WORD);
}

/**
 * Estime le nombre de mots d'un texte
 */
export function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Retourne le nombre de mots utilisables pour un modele donne
 * On reserve 30% du contexte pour : system prompt, output, marge
 * @param {object} providerInfo - Entree du PROVIDER_REGISTRY
 * @returns {number}
 */
export function wordsForContext(providerInfo) {
  const ctx = providerInfo?.contextWindow || 8192;
  const usableTokens = Math.floor(ctx * 0.7);
  return Math.floor(usableTokens / TOKENS_PER_WORD);
}

/**
 * Retourne le nombre de tokens utilisables pour un modele
 */
export function tokensForContext(providerInfo) {
  const ctx = providerInfo?.contextWindow || 8192;
  return Math.floor(ctx * 0.7);
}

/**
 * Tronque un texte au nombre de mots indique
 */
export function truncateToWords(text, maxWords) {
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

/**
 * Tronque un texte au nombre de tokens approximatif indique
 */
export function truncateToTokens(text, maxTokens) {
  const maxWords = Math.floor(maxTokens / TOKENS_PER_WORD);
  return truncateToWords(text, maxWords);
}

/**
 * Formate une quantite de tokens de facon lisible
 */
export function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
