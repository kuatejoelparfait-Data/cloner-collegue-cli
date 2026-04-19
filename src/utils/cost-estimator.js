/**
 * Estimateur de cout pour les operations LLM
 * Calcule les tokens input/output anticipes et le cout en USD/EUR
 * Propose une confirmation avant les operations couteuses
 */

import inquirer from 'inquirer';
import { ui } from './ui.js';
import { estimateTokens, formatTokens } from './tokens.js';
import { getProviderInfo } from '../providers/index.js';

// Taux de change approximatif USD -> EUR (fige, pas d'API pour simplifier)
const USD_TO_EUR = 0.92;

// Seuil au-dessus duquel on demande une confirmation (en USD)
const CONFIRMATION_THRESHOLD_USD = 0.10;

/**
 * Calcule le cout d'une operation LLM
 * @param {object} providerInfo - Entree du PROVIDER_REGISTRY
 * @param {number} inputTokens - Tokens en entree
 * @param {number} outputTokens - Tokens en sortie estimes
 * @returns {{ inputCostUsd: number, outputCostUsd: number, totalUsd: number, totalEur: number }}
 */
export function computeCost(providerInfo, inputTokens, outputTokens) {
  const pricing = providerInfo?.pricing || { input: 0, output: 0 };
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.input;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.output;
  const totalUsd = inputCostUsd + outputCostUsd;
  return {
    inputCostUsd,
    outputCostUsd,
    totalUsd,
    totalEur: totalUsd * USD_TO_EUR,
  };
}

/**
 * Formate un montant en USD ou EUR de maniere lisible
 */
export function formatCost(amount, currency = 'USD') {
  if (amount === 0) return 'gratuit';
  if (amount < 0.01) return `<0.01 ${currency}`;
  if (amount < 1) return `${amount.toFixed(3)} ${currency}`;
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * Estime le cout d'une serie d'appels LLM
 * @param {string} providerId - Id du provider
 * @param {Array<{systemPrompt: string, userMessage: string, maxTokens?: number}>} calls - Appels prevus
 * @returns {object} Details de l'estimation
 */
export function estimateOperation(providerId, calls) {
  const providerInfo = getProviderInfo(providerId);
  if (!providerInfo) {
    throw new Error(`Provider "${providerId}" inconnu pour l'estimation.`);
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const call of calls) {
    const inputText = `${call.systemPrompt || ''}\n${call.userMessage || ''}`;
    const inputTokens = estimateTokens(inputText);
    // L'output est au plus maxTokens (ou outputMax du provider). On estime 70% du max
    const outputCap = call.maxTokens || providerInfo.outputMax || 4096;
    const outputTokens = Math.round(outputCap * 0.7);

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
  }

  const cost = computeCost(providerInfo, totalInputTokens, totalOutputTokens);

  return {
    providerName: providerInfo.name,
    callCount: calls.length,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    ...cost,
  };
}

/**
 * Affiche un recap d'estimation avec couleurs selon le cout
 */
export function displayEstimate(estimate, operationName = 'operation') {
  ui.section(`Estimation de cout — ${operationName}`);

  const { providerName, callCount, inputTokens, outputTokens, totalUsd, totalEur } = estimate;

  console.log(ui.muted(`  Modele         : ${providerName}`));
  console.log(ui.muted(`  Appels prevus  : ${callCount}`));
  console.log(ui.muted(`  Tokens entree  : ${formatTokens(inputTokens)}`));
  console.log(ui.muted(`  Tokens sortie  : ${formatTokens(outputTokens)} (estimation max)`));

  // Couleur selon le cout
  const costLabel = totalUsd === 0
    ? ui.accent('gratuit (local)')
    : totalUsd < 0.05
      ? ui.accent(`${formatCost(totalUsd)} (~${formatCost(totalEur, 'EUR')})`)
      : totalUsd < 0.50
        ? `${formatCost(totalUsd)} (~${formatCost(totalEur, 'EUR')})`
        : ui.warn ? `${formatCost(totalUsd)} (~${formatCost(totalEur, 'EUR')})` : `${formatCost(totalUsd)}`;

  console.log(`  Cout estime    : ${costLabel}`);
  ui.blank();
}

/**
 * Demande une confirmation si le cout depasse le seuil
 * @returns {Promise<boolean>} true si l'utilisateur confirme (ou pas de confirmation requise)
 */
export async function confirmIfCostly(estimate, operationName = 'operation') {
  if (estimate.totalUsd < CONFIRMATION_THRESHOLD_USD) {
    return true;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'list',
    name: 'confirm',
    message: `Cout estime : ${formatCost(estimate.totalUsd)}. Continuer ?`,
    prefix: '  💰',
    choices: [
      { name: `✅  Oui, lancer l'${operationName}`, value: 'yes' },
      { name: '❌  Non, annuler', value: 'no' },
    ],
  }]);

  return confirm === 'yes';
}

/**
 * Raccourci : estime, affiche, demande confirmation si necessaire
 * @returns {Promise<boolean>} true si l'operation peut continuer
 */
export async function estimateAndConfirm(providerId, calls, operationName = 'operation') {
  const estimate = estimateOperation(providerId, calls);
  displayEstimate(estimate, operationName);
  return confirmIfCostly(estimate, operationName);
}
