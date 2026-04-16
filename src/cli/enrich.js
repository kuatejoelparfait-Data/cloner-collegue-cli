/**
 * Commande : cloner enrichir <slug>
 * Ajoute des materiaux a un clone existant
 */

import { createProvider } from '../providers/index.js';
import { collectMaterials } from '../core/materials.js';
import { loadClone, saveClone, snapshotVersion, cloneExists } from '../storage/index.js';
import { PROMPTS } from '../prompts/system.js';
import { ui } from '../utils/ui.js';
import { loadEnv } from '../utils/env.js';

export async function enrichCommand(slug, options) {
  loadEnv();

  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable. Lance "cloner liste" pour voir les clones.`);
    process.exit(1);
  }

  const clone = loadClone(slug);
  ui.ok(`Clone charge : /${slug} (v${clone.meta?.version || '?'})`);

  // Collecter les nouveaux materiaux
  const newMaterials = await collectMaterials(slug);

  if (newMaterials === null) {
    ui.info('Enrichissement annule.');
    return;
  }

  if (!newMaterials.trim()) {
    ui.info('Aucun nouveau materiau. Le clone reste inchange.');
    return;
  }

  // Creer le provider
  const provider = createProvider(options.provider);

  // Fusionner
  const spinner = ui.spinner('Fusion des nouveaux materiaux...');
  spinner.start();

  try {
    const mergerPrompt = PROMPTS.merger(
      { work: clone.work, persona: clone.persona },
      newMaterials
    );

    const mergeResult = await provider.complete(
      mergerPrompt,
      'Analyse les nouveaux materiaux et genere les patchs de fusion.',
      { maxTokens: 4096 }
    );

    spinner.text = 'Application des mises a jour...';

    // Regenerer les fichiers complets avec les patchs
    const updatedWork = await provider.complete(
      `Voici le profil metier existant :\n${clone.work}\n\nVoici les patchs a appliquer :\n${mergeResult}\n\nGenere le fichier work.md mis a jour complet. Si aucun patch ne concerne le profil metier, retourne l'existant tel quel.`,
      'Genere le work.md mis a jour.',
      { maxTokens: 4096 }
    );

    const updatedPersona = await provider.complete(
      `Voici l'empreinte comportementale existante :\n${clone.persona}\n\nVoici les patchs a appliquer :\n${mergeResult}\n\nGenere le fichier persona.md mis a jour complet. Si aucun patch ne concerne l'empreinte, retourne l'existant tel quel.`,
      'Genere le persona.md mis a jour.',
      { maxTokens: 4096 }
    );

    spinner.succeed('Fusion terminee');

    // Incrementer la version
    const currentVersion = parseFloat(clone.meta?.version || '1.0');
    const newVersion = (currentVersion + 0.1).toFixed(1);

    // Archiver l'ancienne version
    snapshotVersion(slug, clone.meta?.version || '1.0');

    // Sauvegarder
    const meta = {
      ...clone.meta,
      version: newVersion,
      mis_a_jour_le: new Date().toISOString(),
      historique_versions: [
        ...(clone.meta?.historique_versions || []),
        { version: newVersion, date: new Date().toISOString(), resume: 'Enrichissement avec nouveaux materiaux' },
      ],
    };

    saveClone(slug, { meta, work: updatedWork, persona: updatedPersona });

    ui.ok(`Clone mis a jour : /${slug} (v${newVersion})`);

  } catch (error) {
    spinner.fail('Erreur pendant la fusion');
    ui.fail(error.message);
    process.exit(1);
  }
}
