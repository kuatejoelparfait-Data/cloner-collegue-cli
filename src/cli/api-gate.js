/**
 * Verrou de cle API
 * Bloque toute utilisation tant qu'aucune cle n'est configuree
 * C'est la PREMIERE chose a faire avant toute utilisation
 *
 * Utilise le PROVIDER_REGISTRY comme source unique de verite
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { getConfig, setConfig, checkApiKey } from '../utils/config.js';
import { listProviders } from '../providers/index.js';
import { ui } from '../utils/ui.js';

/**
 * Verifie que le provider actif a une cle API
 * Si non, bloque et force la configuration
 * Boucle tant que la cle n'est pas fournie ou que l'utilisateur ne change pas de provider
 *
 * @returns {boolean} true si on peut continuer
 */
export async function ensureApiKey() {
  let check = checkApiKey();

  // Tout va bien
  if (check.ok) return true;

  const providers = listProviders();

  // Boucle tant qu'on n'a pas de cle valide
  while (!check.ok) {
    const current = providers.find(p => p.id === check.provider);
    const icon = current?.icon || '🤖';

    console.log('');
    ui.section(`${icon} Configuration requise`);
    console.log(chalk.red.bold('  ⚠  Aucune cle API configuree !'));
    console.log(chalk.gray(`  Provider actif : ${chalk.cyan(current?.name || check.provider)}`));
    console.log(chalk.gray('  Une cle API est obligatoire pour utiliser l\'outil.\n'));

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Que veux-tu faire ?',
      prefix: '  🔑',
      choices: [
        { name: `🔑  Entrer la cle API ${current?.name || check.provider}`, value: 'enter' },
        { name: '🔄  Changer de fournisseur IA', value: 'switch' },
        ...(check.provider !== 'ollama' ? [{ name: '⚪  Utiliser Ollama (local, sans cle)', value: 'ollama' }] : []),
        new inquirer.Separator(),
        { name: '🚪  Quitter', value: 'quit' },
      ],
    }]);

    if (action === 'quit') {
      ui.info('Configure ta cle API et reviens ! 🦐');
      process.exit(0);
    }

    if (action === 'ollama') {
      setConfig('defaultProvider', 'ollama');
      ui.ok('Provider change : Ollama (local)');
      ui.info('Assure-toi qu\'Ollama tourne : ollama serve');
      return true;
    }

    if (action === 'switch') {
      const { newProvider } = await inquirer.prompt([{
        type: 'list',
        name: 'newProvider',
        message: 'Quel fournisseur IA ?',
        prefix: '  🤖',
        choices: providers.map(p => ({
          name: `${p.icon}  ${p.name}${p.id === check.provider ? ' (actuel)' : ''}`,
          value: p.id,
        })),
      }]);

      setConfig('defaultProvider', newProvider);

      if (newProvider === 'ollama') {
        ui.ok('Provider change : Ollama (local, sans cle API)');
        ui.info('Assure-toi qu\'Ollama tourne : ollama serve');
        return true;
      }

      check = checkApiKey();
      continue;
    }

    if (action === 'enter') {
      const url = current?.keyUrl;
      if (url) {
        console.log('');
        ui.info('Obtiens ta cle ici :');
        console.log(chalk.cyan.underline(`  → ${url}`));
        console.log('');
      }

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `Colle ta cle API ${current?.name || check.provider} :`,
        prefix: '  🔑',
        mask: '*',
      }]);

      if (apiKey && apiKey.trim()) {
        setConfig(`${check.provider}.apiKey`, apiKey.trim());
        ui.ok(`Cle ${current?.name || check.provider} enregistree ! ✅`);
        return true;
      } else {
        ui.warn('Cle vide. Reessaie ou change de fournisseur.');
        check = checkApiKey();
      }
    }
  }

  return true;
}
