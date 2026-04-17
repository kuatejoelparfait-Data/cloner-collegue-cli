/**
 * Gestionnaire d'historique de chat avec bornage automatique
 * Quand l'historique depasse un seuil de tokens, les anciens messages sont
 * remplaces par un resume genere par le LLM.
 */

import { ui } from '../utils/ui.js';
import { estimateTokens } from '../utils/tokens.js';
import { PROMPTS } from '../prompts/system.js';

// Seuil de declenchement : on resume quand l'historique atteint 50% du contexte
const SUMMARY_TRIGGER_RATIO = 0.5;
// Cible apres resume : l'historique compresse doit tenir dans 20% du contexte
const SUMMARY_TARGET_RATIO = 0.2;
// Nombre minimum de messages a conserver intacts (meme apres resume)
const KEEP_RECENT_PAIRS = 4; // 4 paires user/assistant = 8 messages

/**
 * Calcule le nombre total de tokens d'un historique + system prompt
 */
export function historyTokens(systemPrompt, messages) {
  let total = estimateTokens(systemPrompt);
  for (const msg of messages) {
    total += estimateTokens(msg.content);
  }
  return total;
}

/**
 * Determine si l'historique doit etre resume
 */
export function shouldSummarize(systemPrompt, messages, providerInfo) {
  const ctx = providerInfo?.contextWindow || 8192;
  const current = historyTokens(systemPrompt, messages);
  const threshold = ctx * SUMMARY_TRIGGER_RATIO;
  return current > threshold;
}

/**
 * Compresse l'historique :
 * 1. Separe les anciens messages (a resumer) des recents (a garder)
 * 2. Genere un resume des anciens via le provider
 * 3. Retourne un nouvel historique : [resume, ...messages_recents]
 *
 * @param {object} provider - Instance du provider LLM
 * @param {Array} messages - Historique complet
 * @returns {Promise<Array>} Nouvel historique compresse
 */
export async function summarizeHistory(provider, messages) {
  if (messages.length <= KEEP_RECENT_PAIRS * 2) {
    // Pas assez de messages pour resumer
    return messages;
  }

  // Separer : on garde les N dernieres paires intactes, on resume le reste
  const keepCount = KEEP_RECENT_PAIRS * 2;
  const toSummarize = messages.slice(0, -keepCount);
  const recent = messages.slice(-keepCount);

  if (toSummarize.length === 0) return messages;

  const spinner = ui.spinner('Compression de l\'historique...');
  spinner.start();

  try {
    const summaryPrompt = PROMPTS.historySummarizer(toSummarize);
    const summary = await provider.complete(
      summaryPrompt,
      'Genere le resume maintenant.',
      { maxTokens: 600 }
    );

    spinner.succeed(`Historique compresse (${toSummarize.length} messages resumes)`);

    // Le resume est injecte comme un message system-like (role user avec balise)
    const summaryMessage = {
      role: 'user',
      content: `[RESUME AUTOMATIQUE DES ECHANGES PRECEDENTS]\n${summary}\n[FIN DU RESUME — la conversation reprend ci-dessous]`,
    };
    const ackMessage = {
      role: 'assistant',
      content: 'D\'accord, je prends en compte ce contexte et on continue.',
    };

    return [summaryMessage, ackMessage, ...recent];
  } catch (error) {
    spinner.fail('Echec de la compression, historique conserve tel quel');
    ui.warn(`Detail : ${error.message}`);
    // Fallback : on tronque simplement les plus anciens
    return messages.slice(-keepCount);
  }
}

/**
 * Encapsule la logique : verifie et resume si necessaire
 * A appeler AVANT chaque envoi au LLM
 *
 * @param {object} provider - Instance du provider
 * @param {object} providerInfo - Entree PROVIDER_REGISTRY correspondante
 * @param {string} systemPrompt
 * @param {Array} messages - Historique (mute si resume applique)
 * @returns {Promise<Array>} Historique a utiliser pour l'appel
 */
export async function ensureFits(provider, providerInfo, systemPrompt, messages) {
  if (!shouldSummarize(systemPrompt, messages, providerInfo)) {
    return messages;
  }

  const ctx = providerInfo?.contextWindow || 8192;
  const current = historyTokens(systemPrompt, messages);
  const percent = Math.round((current / ctx) * 100);
  ui.info(`Historique a ${percent}% du contexte — compression automatique...`);

  return summarizeHistory(provider, messages);
}
