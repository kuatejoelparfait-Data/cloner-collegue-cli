/**
 * Commande : /clone
 * Cree un nouveau clone avec navigation retour entre les phases
 */

import inquirer from 'inquirer';
import { createProviderAsync } from '../providers/index.js';
import { collectInfo } from '../core/intake.js';
import { collectMaterials } from '../core/materials.js';
import { analyzeMaterials } from '../core/analyzer.js';
import { buildClone, previewClone } from '../core/builder.js';
import { initClone, saveClone, snapshotVersion, cloneExists } from '../storage/index.js';
import { getConfig } from '../utils/config.js';
import { ui } from '../utils/ui.js';
import { loadEnv } from '../utils/env.js';
import { estimateAndConfirm } from '../utils/cost-estimator.js';
import { PROMPTS } from '../prompts/system.js';
import { buildIndex, saveIndex } from '../core/rag.js';

export async function cloneCommand(options = {}) {
  loadEnv();

  const config = getConfig();
  const providerName = options.provider || config.defaultProvider || 'claude';
  const modelName = options.model || config.providers?.[providerName]?.model;

  const phases = ['info', 'materials', 'analyze', 'save'];
  let phaseIndex = 0;
  let info = null;
  let materials = null;

  try {
    while (phaseIndex < phases.length) {
      const phase = phases[phaseIndex];

      // ── Phase 1 : Informations ──
      if (phase === 'info') {
        info = await collectInfo();
        if (!info) return; // Annule

        if (cloneExists(info.slug)) {
          ui.warn(`Un clone "/${info.slug}" existe deja.`);
          const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Que faire ?',
            choices: [
              { name: 'Ecraser le clone existant', value: 'overwrite' },
              { name: 'Enrichir le clone existant', value: 'enrich' },
              { name: 'Choisir un autre nom', value: 'back' },
              { name: 'Annuler', value: 'cancel' },
            ],
          }]);

          if (action === 'cancel') return;
          if (action === 'back') continue; // Recommencer Phase 1
          if (action === 'enrich') {
            ui.info(`Lance : /enrichir ${info.slug}`);
            return;
          }
          // overwrite : on continue
        }

        phaseIndex++;
      }

      // ── Phase 2 : Materiaux ──
      else if (phase === 'materials') {
        materials = await collectMaterials(info.slug);

        if (materials === null) {
          // Retour demande → revenir a Phase 1
          phaseIndex--;
          continue;
        }

        phaseIndex++;
      }

      // ── Phase 3 : Analyse et construction ──
      else if (phase === 'analyze') {
        const provider = await createProviderAsync(providerName, { model: modelName });
        ui.info(`Utilisation de ${provider.name} (${provider.model || provider.defaultModel})`);

        // Estimation du cout : 2 appels d'analyse + 2 appels de construction
        const materialsMessage = materials.trim()
          ? `Voici les materiaux a analyser :\n\n${materials}`
          : `Aucun materiau fourni. Genere une analyse basee sur le profil.`;

        const plannedCalls = [
          { systemPrompt: PROMPTS.workAnalysis(info), userMessage: materialsMessage, maxTokens: 4096 },
          { systemPrompt: PROMPTS.personaAnalysis(info), userMessage: materialsMessage, maxTokens: 4096 },
          // Construction : on estime en utilisant la taille de l'analyse (~2000 tokens chacune)
          { systemPrompt: 'Builder work (approximatif)', userMessage: materialsMessage.slice(0, 4000), maxTokens: 4096 },
          { systemPrompt: 'Builder persona (approximatif)', userMessage: materialsMessage.slice(0, 4000), maxTokens: 4096 },
        ];

        const shouldContinue = await estimateAndConfirm(providerName, plannedCalls, 'analyse + construction');
        if (!shouldContinue) {
          ui.info('Operation annulee.');
          return;
        }

        const analysis = await analyzeMaterials(provider, info, materials);
        const { work, persona } = await buildClone(provider, info, analysis);

        previewClone(info, work, persona);

        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'Que faire ?',
          prefix: '  ✅',
          choices: [
            { name: '✓  Sauvegarder ce clone', value: 'save' },
            { name: '🔄  Regenerer (relancer l\'analyse)', value: 'retry' },
            { name: '↩️   Retour (changer les materiaux)', value: 'back' },
            { name: '✗  Annuler', value: 'cancel' },
          ],
        }]);

        if (action === 'cancel') { ui.info('Annule.'); return; }
        if (action === 'retry') continue; // Refaire Phase 3
        if (action === 'back') { phaseIndex--; continue; } // Retour Phase 2

        // Stocker les resultats pour Phase 4
        info._work = work;
        info._persona = persona;
        info._provider = providerName;
        info._model = modelName || provider.defaultModel;
        phaseIndex++;
      }

      // ── Phase 4 : Sauvegarde ──
      else if (phase === 'save') {
        initClone(info.slug);

        const meta = {
          slug: info.slug,
          prenom: info.prenom,
          version: '1.0',
          cree_le: new Date().toISOString(),
          mis_a_jour_le: new Date().toISOString(),
          profil: {
            entreprise: info.entreprise || '',
            poste: info.poste || '',
            niveau: info.niveau || '',
            genre: info.genre || '',
          },
          mbti: info.mbti || '',
          tags_personnalite: info.tags || [],
          tags_culture: info.tagsCulture || [],
          impression: info.impression || '',
          provider: info._provider,
          model: info._model,
          historique_versions: [
            { version: '1.0', date: new Date().toISOString(), resume: 'Creation initiale' },
          ],
        };

        saveClone(info.slug, { meta, work: info._work, persona: info._persona });
        snapshotVersion(info.slug, '1.0');

        // Construction de l'index RAG a partir des materiaux bruts
        if (materials && materials.trim()) {
          try {
            const index = buildIndex(materials);
            saveIndex(info.slug, index);
            ui.info(`Index RAG construit : ${index.chunks.length} chunk(s) indexe(s) pour recherche pertinente.`);
          } catch (err) {
            ui.warn(`Index RAG non genere : ${err.message}`);
          }
        }

        ui.blank();
        ui.box(`Clone cree : /${info.slug}`, [
          '',
          `/chat ${info.slug}              → discuter avec le clone`,
          `/chat ${info.slug} --metier     → profil metier uniquement`,
          `/chat ${info.slug} --comportement → empreinte comportementale`,
          `/enrichir ${info.slug}          → ajouter des materiaux`,
          `/status ${info.slug}            → voir les details`,
          '',
        ]);

        phaseIndex++;
      }
    }

  } catch (error) {
    ui.fail(error.message);
    if (process.env.DEBUG) console.error(error);
  }
}
