/**
 * Assistant de premier lancement
 * Detecte si c'est la premiere fois et guide l'utilisateur
 * Navigation retour a chaque etape
 */

import inquirer from 'inquirer';
import { getConfig, setConfig, getConfigDir } from '../utils/config.js';
import { listProviders } from '../providers/index.js';
import { ui } from '../utils/ui.js';
import fs from 'fs';
import path from 'path';

/**
 * Verifie si c'est le premier lancement
 */
export function isFirstLaunch() {
  const config = getConfig();
  return !config._onboarded;
}

/**
 * Lance l'assistant de configuration initiale
 * Boucle d'etapes avec retour arriere possible
 */
export async function runOnboarding() {
  console.log('');
  ui.section('Bienvenue ! Configurons ton outil');
  console.log(ui.muted('  Cette configuration ne se fait qu\'une seule fois.'));
  console.log(ui.muted('  Tu peux revenir en arriere a chaque etape.\n'));

  const providers = listProviders();
  let stepIndex = 0;

  // Etat collecte
  let defaultProvider = null;
  let model = null;

  while (stepIndex < 4) {
    // ── Etape 0 : Choix du provider ──
    if (stepIndex === 0) {
      const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: 'Quel fournisseur IA veux-tu utiliser par defaut ?',
        prefix: '  🤖',
        choices: providers.map(p => ({
          name: `${p.icon}  ${p.name}${p.id === 'claude' ? ' — recommande' : p.id === 'ollama' ? ' — gratuit, hors-ligne' : ''}`,
          value: p.id,
        })),
      }]);

      defaultProvider = choice;
      setConfig('defaultProvider', defaultProvider);
      stepIndex++;
      continue;
    }

    // ── Etape 1 : Cle API ──
    if (stepIndex === 1) {
      if (defaultProvider === 'ollama') {
        ui.info('Ollama ne necessite pas de cle API.');
        ui.info('Assure-toi qu\'Ollama tourne : ollama serve');
        stepIndex++;
        continue;
      }

      const providerInfo = providers.find(p => p.id === defaultProvider);

      const envKey = providerInfo.envVar ? process.env[providerInfo.envVar] : null;
      if (envKey) {
        ui.ok(`Cle ${providerInfo.name} detectee dans les variables d'environnement`);
        setConfig(`${defaultProvider}.apiKey`, envKey);
        stepIndex++;
        continue;
      }

      ui.blank();
      ui.info(`Pour obtenir ta cle API ${providerInfo.name} :`);
      if (providerInfo.keyUrl) {
        ui.info(`  → ${providerInfo.keyUrl}`);
      }
      ui.blank();

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `Cle API ${providerInfo.name} (ou tape /retour) :`,
        prefix: '  🔑',
        mask: '*',
        validate: (v) => {
          const cmd = v.trim().toLowerCase();
          if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return true;
          if (!v.trim()) return 'Tu pourras la configurer plus tard avec /config';
          return true;
        },
      }]);

      const cmd = apiKey.trim().toLowerCase();
      if (cmd === '/retour' || cmd === '/back' || cmd === '/r') {
        stepIndex--;
        continue;
      }

      if (apiKey.trim()) {
        setConfig(`${defaultProvider}.apiKey`, apiKey.trim());
        ui.ok(`Cle ${providerInfo.name} enregistree`);
      } else {
        ui.warn('Pas de cle pour le moment. Tu pourras la configurer avec /config');
      }

      stepIndex++;
      continue;
    }

    // ── Etape 2 : Choix du modele ──
    if (stepIndex === 2) {
      const providerInfo = providers.find(p => p.id === defaultProvider);

      const modelChoices = providerInfo.models.map((m, i) => ({
        name: i === 0 ? `${m} (recommande)` : m,
        value: m,
      }));
      modelChoices.push(new inquirer.Separator());
      modelChoices.push({ name: '↩️   Retour — changer de fournisseur', value: '__back__' });

      const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: `Quel modele ${providerInfo.name} par defaut ?`,
        prefix: '  🧠',
        choices: modelChoices,
      }]);

      if (choice === '__back__') {
        stepIndex--;
        continue;
      }

      model = choice;
      setConfig(`${defaultProvider}.model`, model);
      stepIndex++;
      continue;
    }

    // ── Etape 3 : Configurer d'autres providers ──
    if (stepIndex === 3) {
      const { configMore } = await inquirer.prompt([{
        type: 'list',
        name: 'configMore',
        message: 'Veux-tu configurer d\'autres fournisseurs IA ?',
        prefix: '  ➕',
        choices: [
          { name: '⏭️   Non, c\'est bon — terminer la configuration', value: 'no' },
          { name: '➕  Oui — configurer un autre fournisseur', value: 'yes' },
          { name: '↩️   Retour — changer le modele', value: 'back' },
        ],
      }]);

      if (configMore === 'back') {
        stepIndex--;
        continue;
      }

      if (configMore === 'yes') {
        const otherProviders = providers.filter(p => p.id !== defaultProvider && p.id !== 'ollama');
        for (const p of otherProviders) {
          const { wantThis } = await inquirer.prompt([{
            type: 'list',
            name: 'wantThis',
            message: `Configurer ${p.name} ?`,
            choices: [
              { name: `✅  Oui — entrer la cle ${p.name}`, value: 'yes' },
              { name: '⏭️   Passer', value: 'no' },
              { name: '↩️   Arreter — terminer la configuration', value: 'stop' },
            ],
          }]);

          if (wantThis === 'stop') break;
          if (wantThis === 'no') continue;

          const { key } = await inquirer.prompt([{
            type: 'password',
            name: 'key',
            message: `Cle API ${p.name} :`,
            mask: '*',
          }]);

          if (key.trim()) {
            setConfig(`${p.id}.apiKey`, key.trim());
            ui.ok(`${p.name} configure`);
          }
        }
      }

      stepIndex++;
      continue;
    }
  }

  // Marquer comme configure
  setConfig('_onboarded', true);
  setConfig('_onboarded_at', new Date().toISOString());

  const providerInfo = providers.find(p => p.id === defaultProvider);

  ui.blank();
  ui.box('Configuration terminee !', [
    '',
    `Provider : ${providerInfo.name}`,
    `Modele   : ${model}`,
    `Config   : ${getConfigDir()}/config.json`,
    '',
    'Commandes disponibles :',
    '  /clone     Creer un clone',
    '  /liste     Voir les clones',
    '  /config    Modifier la configuration',
    '  /aide      Afficher l\'aide',
    '',
  ]);

  return { defaultProvider, model };
}
