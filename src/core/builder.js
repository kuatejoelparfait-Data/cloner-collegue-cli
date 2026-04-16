/**
 * Module de construction
 * Genere les fichiers work.md et persona.md a partir des analyses
 */

import { ui } from '../utils/ui.js';
import { PROMPTS } from '../prompts/system.js';

/**
 * Genere les fichiers du clone
 * @param {object} provider - Instance du provider IA
 * @param {object} info - Infos de base
 * @param {object} analysis - { workAnalysis, personaAnalysis }
 * @returns {object} { work, persona }
 */
export async function buildClone(provider, info, analysis) {
  const spinner = ui.spinner('Construction du clone...');
  spinner.start();

  try {
    const [work, persona] = await Promise.all([
      buildWork(provider, info, analysis.workAnalysis, spinner),
      buildPersona(provider, info, analysis.personaAnalysis, spinner),
    ]);

    spinner.succeed('Clone construit');

    return { work, persona };
  } catch (error) {
    spinner.fail('Erreur pendant la construction');
    throw error;
  }
}

/**
 * Genere le profil metier
 */
async function buildWork(provider, info, analysis, spinner) {
  spinner.text = 'Construction du profil metier...';
  return provider.complete(
    PROMPTS.workBuilder(info, analysis),
    'Genere le fichier work.md maintenant.',
    { maxTokens: 4096 }
  );
}

/**
 * Genere l'empreinte comportementale
 */
async function buildPersona(provider, info, analysis, spinner) {
  spinner.text = 'Construction de l\'empreinte comportementale...';
  return provider.complete(
    PROMPTS.personaBuilder(info, analysis),
    'Genere le fichier persona.md maintenant.',
    { maxTokens: 4096 }
  );
}

/**
 * Affiche un apercu du clone genere
 */
export function previewClone(info, work, persona) {
  ui.section(`Apercu du clone de ${info.prenom}`);

  // Extraire les premieres lignes de chaque fichier
  const workPreview = work.split('\n').filter(l => l.trim()).slice(0, 8).join('\n');
  const personaPreview = persona.split('\n').filter(l => l.trim()).slice(0, 8).join('\n');

  console.log(ui.accent('  ── Profil metier ──'));
  ui.block(workPreview);
  console.log(ui.muted('  ...'));
  ui.blank();

  console.log(ui.accent('  ── Empreinte comportementale ──'));
  ui.block(personaPreview);
  console.log(ui.muted('  ...'));
  ui.blank();
}
