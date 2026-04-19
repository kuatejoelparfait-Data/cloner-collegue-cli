/**
 * Verrou de cle API
 * Bloque toute utilisation tant qu'aucune cle n'est configuree
 * C'est la PREMIERE chose a faire avant toute utilisation
 *
 * Utilise le PROVIDER_REGISTRY comme source unique de verite
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { getConfig, setConfig, checkApiKey, checkApiKeyAsync } from '../utils/config.js';
import { listProviders } from '../providers/index.js';
import { ui } from '../utils/ui.js';
import { saveApiKey, isKeychainAvailable } from '../utils/keychain.js';

/**
 * Verifie que le provider actif a une cle API
 * Si non, bloque et force la configuration
 * Boucle tant que la cle n'est pas fournie ou que l'utilisateur ne change pas de provider
 *
 * @returns {boolean} true si on peut continuer
 */
export async function ensureApiKey() {
  // Migration silencieuse : si des cles plaintext existent et keytar est dispo,
  // on les deplace vers le trousseau systeme
  try {
    const keychainOk = await isKeychainAvailable();
    if (keychainOk) {
      const { migratePlaintextKeys } = await import('../utils/keychain.js');
      const { setConfig, getConfig } = await import('../utils/config.js');
      const cfg = getConfig();
      const { migrated } = await migratePlaintextKeys(cfg);
      if (migrated.length > 0) {
        // Re-ecrire la config sans les cles plaintext
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const configFile = path.default.join(os.default.homedir(), '.cloner-collegue', 'config.json');
        fs.default.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
        ui.info(`🔒 ${migrated.length} cle(s) API migree(s) vers le trousseau systeme : ${migrated.join(', ')}`);
      }
    }
  } catch {
    // Ne pas bloquer si la migration echoue
  }

  // Check async : inclut env + keychain + plaintext
  let check = await checkApiKeyAsync();

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

      check = await checkApiKeyAsync();
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
        // Essayer le keychain en priorite
        const keychainOk = await isKeychainAvailable();
        if (keychainOk) {
          const result = await saveApiKey(check.provider, apiKey.trim());
          if (result.ok) {
            ui.ok(`Cle ${current?.name || check.provider} enregistree dans le trousseau systeme ! 🔒`);
          } else {
            // Fallback plaintext
            setConfig(`${check.provider}.apiKey`, apiKey.trim());
            ui.ok(`Cle ${current?.name || check.provider} enregistree (plaintext, keychain indispo).`);
          }
        } else {
          setConfig(`${check.provider}.apiKey`, apiKey.trim());
          ui.ok(`Cle ${current?.name || check.provider} enregistree ! ✅`);
          ui.warn('Note : stockee en clair (trousseau systeme indisponible).');
        }
        return true;
      } else {
        ui.warn('Cle vide. Reessaie ou change de fournisseur.');
        check = await checkApiKeyAsync();
      }
    }
  }

  return true;
}
