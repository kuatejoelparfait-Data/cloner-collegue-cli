/**
 * Commande : /config
 * Configure les cles API et preferences — avec retour a chaque etape
 */

import inquirer from 'inquirer';
import { getConfig, setConfig, getConfigDir } from '../utils/config.js';
import { listProviders } from '../providers/index.js';
import { ui } from '../utils/ui.js';

export async function configCommand(options = {}) {
  // Mode --set : modifier une valeur directement
  if (options.set) {
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');
    if (!key || !value) {
      ui.fail('Format : cloner config --set cle=valeur');
      ui.info('Exemples :');
      ui.info('  cloner config --set claude.apiKey=sk-ant-...');
      ui.info('  cloner config --set openai.apiKey=sk-...');
      ui.info('  cloner config --set defaultProvider=openai');
      return;
    }
    setConfig(key, value);
    ui.ok(`${key} = ${value.slice(0, 8)}...`);
    return;
  }

  // Mode --show : afficher la config
  if (options.show) {
    showConfig();
    return;
  }

  // Mode interactif avec boucle et retour
  await configLoop();
}

function showConfig() {
  const config = getConfig();
  ui.section('Configuration actuelle');
  ui.info(`Dossier : ${getConfigDir()}`);
  ui.blank();
  ui.table([
    ['Provider par defaut', config.defaultProvider || '(non defini)'],
    ['Langue', config.language || 'fr'],
  ]);
  ui.blank();

  listProviders().forEach(p => {
    const providerConfig = config.providers?.[p.id] || {};
    const hasKey = providerConfig.apiKey ? '✓ configuree' : '✗ manquante';
    const keyStatus = !p.needsKey ? '(pas besoin)' : hasKey;
    console.log(`  ${p.icon || ''}  ${ui.accent(p.name.padEnd(22))} ${keyStatus}  ${ui.muted(`modele: ${providerConfig.model || p.defaultModel || p.models[0]}`)}`);
  });
}

async function configLoop() {
  let running = true;

  while (running) {
    ui.section('Configuration');

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Que veux-tu configurer ?',
      prefix: '  ⚙️',
      choices: [
        { name: '📋  Voir la configuration actuelle', value: 'show' },
        { name: '🤖  Changer le provider par defaut', value: 'provider' },
        { name: '🔑  Configurer une cle API', value: 'apikey' },
        { name: '🧠  Changer le modele par defaut', value: 'model' },
        { name: '🔧  Configurer tous les providers', value: 'all' },
        new inquirer.Separator(),
        { name: '↩️   Retour', value: 'back' },
      ],
    }]);

    if (action === 'back') {
      running = false;
      continue;
    }

    if (action === 'show') {
      showConfig();
      continue;
    }

    if (action === 'provider') {
      await configProvider();
      continue;
    }

    if (action === 'apikey') {
      await configApiKey();
      continue;
    }

    if (action === 'model') {
      await configModel();
      continue;
    }

    if (action === 'all') {
      await configAllProviders();
      continue;
    }
  }
}

async function configProvider() {
  const config = getConfig();
  const providers = listProviders();

  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Provider par defaut :',
    prefix: '  🤖',
    choices: [
      ...providers.map(p => ({
        name: p.id === config.defaultProvider ? `${p.name} (actuel)` : p.name,
        value: p.id,
      })),
      new inquirer.Separator(),
      { name: '↩️  Retour', value: 'back' },
    ],
  }]);

  if (provider === 'back') return;

  setConfig('defaultProvider', provider);
  ui.ok(`Provider par defaut : ${provider}`);
}

async function configApiKey() {
  const providers = listProviders().filter(p => p.needsKey);

  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Configurer la cle de quel provider ?',
    prefix: '  🔑',
    choices: [
      ...providers.map(p => ({ name: `${p.icon}  ${p.name}`, value: p.id })),
      new inquirer.Separator(),
      { name: '↩️  Retour', value: 'back' },
    ],
  }]);

  if (provider === 'back') return;

  const pInfo = providers.find(p => p.id === provider);
  if (pInfo?.keyUrl) {
    ui.info(`Obtenir ta cle : ${pInfo.keyUrl}`);
  }

  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: `Cle API (ou laisser vide pour annuler) :`,
    prefix: '  🔑',
    mask: '*',
  }]);

  if (apiKey.trim()) {
    setConfig(`${provider}.apiKey`, apiKey.trim());
    ui.ok(`Cle API enregistree pour ${provider}`);
  } else {
    ui.info('Annule.');
  }
}

async function configModel() {
  const config = getConfig();
  const providers = listProviders();
  const current = providers.find(p => p.id === config.defaultProvider);

  if (!current) {
    ui.warn('Aucun provider par defaut. Configure-en un d\'abord.');
    return;
  }

  const { model } = await inquirer.prompt([{
    type: 'list',
    name: 'model',
    message: `Modele ${current.name} :`,
    prefix: '  🧠',
    choices: [
      ...current.models.map(m => ({
        name: m === config.providers?.[current.id]?.model ? `${m} (actuel)` : m,
        value: m,
      })),
      new inquirer.Separator(),
      { name: '↩️  Retour', value: 'back' },
    ],
  }]);

  if (model === 'back') return;

  setConfig(`${current.id}.model`, model);
  ui.ok(`Modele : ${model}`);
}

async function configAllProviders() {
  const providers = listProviders();

  for (const p of providers) {
    ui.blank();
    console.log(ui.accent(`  ── ${p.name} ──`));

    if (p.id === 'ollama') {
      const { url } = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: `URL Ollama :`,
        default: 'http://localhost:11434/v1',
      }]);
      setConfig(`${p.id}.baseURL`, url);
      continue;
    }

    const { wantConfig } = await inquirer.prompt([{
      type: 'list',
      name: 'wantConfig',
      message: `Configurer ${p.name} ?`,
      choices: [
        { name: 'Oui', value: true },
        { name: 'Passer', value: false },
        { name: '↩️  Arreter et revenir', value: 'back' },
      ],
    }]);

    if (wantConfig === 'back') return;
    if (!wantConfig) continue;

    const { apiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'apiKey',
      message: `Cle API ${p.name} :`,
      mask: '*',
    }]);

    if (apiKey.trim()) {
      setConfig(`${p.id}.apiKey`, apiKey.trim());
      ui.ok(`${p.name} configure`);
    }

    const { model } = await inquirer.prompt([{
      type: 'list',
      name: 'model',
      message: `Modele par defaut :`,
      choices: p.models,
    }]);
    setConfig(`${p.id}.model`, model);
  }

  ui.ok('Configuration terminee !');
}
