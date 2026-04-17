/**
 * Module d'analyse
 * Envoie les materiaux au LLM pour extraire le profil metier et l'empreinte comportementale
 */

import { ui } from '../utils/ui.js';
import { PROMPTS } from '../prompts/system.js';

/**
 * Lance l'analyse des materiaux en parallele
 * @param {object} provider - Instance du provider IA
 * @param {object} info - Infos de base du collegue
 * @param {string} materials - Materiaux concatenes
 * @returns {object} { workAnalysis, personaAnalysis }
 */
export async function analyzeMaterials(provider, info, materials) {
  ui.section('Phase 3 — Modelisation');

  const spinner = ui.spinner(`Analyse en cours via ${provider.name}...`);
  spinner.start();

  try {
    // Lancer les deux analyses en parallele
    const [workAnalysis, personaAnalysis] = await Promise.all([
      analyzeWork(provider, info, materials, spinner),
      analyzePersona(provider, info, materials, spinner),
    ]);

    spinner.succeed('Modelisation terminee');

    return { workAnalysis, personaAnalysis };
  } catch (error) {
    spinner.fail('Erreur pendant l\'analyse');
    throw error;
  }
}

/**
 * Analyse du profil metier
 */
async function analyzeWork(provider, info, materials, spinner) {
  spinner.text = 'Analyse du profil metier...';

  const systemPrompt = PROMPTS.workAnalysis(info);
  const userMessage = materials.trim()
    ? `Voici les materiaux a analyser :\n\n${materials}`
    : `Aucun materiau fourni. Genere une analyse basee uniquement sur le profil : ${info.poste || ''} ${info.niveau || ''} chez ${info.entreprise || ''}. Marque toutes les sections comme "(materiaux insuffisants)".`;

  return provider.complete(systemPrompt, userMessage, { maxTokens: 4096 });
}

/**
 * Analyse de l'empreinte comportementale
 */
async function analyzePersona(provider, info, materials, spinner) {
  spinner.text = 'Analyse de l\'empreinte comportementale...';

  const systemPrompt = PROMPTS.personaAnalysis(info);
  const userMessage = materials.trim()
    ? `Voici les materiaux a analyser :\n\n${materials}`
    : `Aucun materiau fourni. Genere une analyse basee uniquement sur les tags : ${info.tags?.join(', ') || 'aucun'} et l'impression : "${info.impression || 'aucune'}". Infere les comportements depuis les tags.`;

  return provider.complete(systemPrompt, userMessage, { maxTokens: 4096 });
}
