/**
 * Mode Shell interactif
 * Un vrai REPL ou l'utilisateur tape des /commandes
 * C'est le coeur de l'experience utilisateur
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { cloneCommand } from './clone.js';
import { listCommand } from './list.js';
import { chatCommand } from './chat.js';
import { configCommand } from './config-cmd.js';
import { enrichCommand } from './enrich.js';
import { deleteCommand } from './delete.js';
import { statusCommand } from './status.js';
import { exportCommand } from './export.js';
import { historyCommand } from './history.js';
import { rollbackCommand } from './rollback.js';
import { listClones } from '../storage/index.js';
import { getConfig } from '../utils/config.js';
import { checkApiKey } from '../utils/config.js';
import { ensureApiKey } from './api-gate.js';
import { ui } from '../utils/ui.js';

/**
 * Helper DRY : propose un selecteur de clone si aucun slug n'est fourni
 */
async function pickClone(message, icon, args) {
  if (args.length > 0) return args[0];
  const clones = listClones();
  if (clones.length === 0) { ui.info('Aucun clone. Cree-en un avec /clone'); return null; }
  const { slug } = await inquirer.prompt([{
    type: 'list', name: 'slug', message, prefix: `  ${icon}`,
    choices: [
      ...clones.map(c => ({ name: `${c.prenom || c.slug} — ${c.profil?.poste || ''} (v${c.version || '1.0'})`, value: c.slug })),
      new inquirer.Separator(),
      { name: '↩️  Retour', value: '__back__' },
    ],
  }]);
  return slug === '__back__' ? null : slug;
}

/**
 * Dictionnaire de toutes les commandes slash
 */
const COMMANDS = {
  // Creation et gestion
  '/clone':       { fn: cmdClone,     desc: 'Creer un nouveau clone',              alias: ['/c', '/creer', '/nouveau'] },
  '/enrichir':    { fn: cmdEnrich,    desc: 'Ajouter des materiaux a un clone',    alias: ['/e', '/ajouter'] },
  '/chat':        { fn: cmdChat,      desc: 'Discuter avec un clone',              alias: ['/t', '/parler', '/discuter'] },

  // Consultation
  '/liste':       { fn: cmdList,      desc: 'Voir tous les clones',                alias: ['/ls', '/l'] },
  '/status':      { fn: cmdStatus,    desc: 'Infos detaillees sur un clone',       alias: ['/s', '/info'] },
  '/historique':  { fn: cmdHistory,   desc: 'Historique des versions d\'un clone',  alias: ['/h', '/versions'] },

  // Export et partage
  '/exporter':    { fn: cmdExport,    desc: 'Exporter un clone en fichier',        alias: ['/export', '/exp'] },

  // Configuration
  '/config':      { fn: cmdConfig,    desc: 'Modifier la configuration',           alias: ['/cfg', '/parametres'] },
  '/modele':      { fn: cmdModel,     desc: 'Changer de modele IA rapidement',     alias: ['/model', '/m'] },
  '/provider':    { fn: cmdProvider,  desc: 'Changer de fournisseur IA',           alias: ['/p', '/fournisseur'] },

  // Gestion
  '/supprimer':   { fn: cmdDelete,    desc: 'Supprimer un clone',                  alias: ['/rm', '/del'] },
  '/renommer':    { fn: cmdRename,    desc: 'Renommer un clone',                   alias: ['/ren', '/mv'] },
  '/rollback':    { fn: cmdRollback,  desc: 'Restaurer une version anterieure',    alias: ['/rb', '/restaurer'] },

  // Aide
  '/aide':        { fn: cmdHelp,      desc: 'Afficher cette aide',                 alias: ['/help', '/?', '/a'] },
  '/quitter':     { fn: cmdQuit,      desc: 'Quitter le programme',                alias: ['/quit', '/q', '/exit'] },
};

/**
 * Construit un index inverse : alias -> commande principale
 */
function buildAliasMap() {
  const map = {};
  for (const [cmd, def] of Object.entries(COMMANDS)) {
    map[cmd] = cmd;
    if (def.alias) {
      def.alias.forEach(a => { map[a] = cmd; });
    }
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

/**
 * Lance le shell interactif
 */
export async function startShell() {
  const config = getConfig();
  const providerName = config.defaultProvider || 'claude';

  ui.info(`Provider actif : ${chalk.cyan(providerName)} — tape ${chalk.yellow('/aide')} pour voir les commandes`);
  console.log('');

  while (true) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: chalk.cyan('🦐 >'),
      prefix: '',
    }]);

    const raw = input.trim();
    if (!raw) continue;

    // Parser la commande et ses arguments
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Chercher dans l'index d'alias
    const resolved = ALIAS_MAP[cmd];

    if (resolved) {
      try {
        await COMMANDS[resolved].fn(args);
      } catch (err) {
        ui.fail(err.message);
        if (process.env.DEBUG) console.error(err);
      }
    } else if (cmd.startsWith('/')) {
      // Commande inconnue commencant par /
      ui.warn(`Commande inconnue : ${cmd}`);
      ui.info('Tape /aide pour voir les commandes disponibles');

      // Suggestion de commande proche
      const suggestion = findClosest(cmd);
      if (suggestion) {
        ui.info(`Tu voulais dire ${chalk.cyan(suggestion)} ?`);
      }
    } else {
      // Pas une commande : traiter comme raccourci de chat
      // Si un seul clone existe, chatter avec directement
      const clones = listClones();
      if (clones.length === 1) {
        ui.info(`Message envoye a /${clones[0].slug}...`);
        await cmdQuickChat(clones[0].slug, raw);
      } else if (clones.length > 1) {
        ui.info('Plusieurs clones existent. Utilise /chat <slug> ou /liste');
      } else {
        ui.info('Aucun clone. Cree-en un avec /clone');
      }
    }

    console.log('');
  }
}

/**
 * Trouve la commande la plus proche (distance de Levenshtein simplifiee)
 */
function findClosest(input) {
  const all = Object.keys(ALIAS_MAP);
  let best = null;
  let bestDist = Infinity;

  for (const cmd of all) {
    const dist = levenshtein(input, cmd);
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = cmd;
    }
  }

  return best;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }
  return dp[m][n];
}

// ═══════════════════════════════════════
//  Implementations des commandes
// ═══════════════════════════════════════

async function cmdClone() {
  if (!(await ensureApiKey())) return;
  const config = getConfig();
  await cloneCommand({ provider: config.defaultProvider, model: config.providers?.[config.defaultProvider]?.model });
}

async function cmdChat(args) {
  const slug = await pickClone('Avec qui veux-tu discuter ?', '💬', args);
  if (!slug) return;

  if (!(await ensureApiKey())) return;
  const flags = args.slice(1);
  const config = getConfig();
  await chatCommand(slug, {
    provider: config.defaultProvider,
    model: config.providers?.[config.defaultProvider]?.model,
    metier: flags.includes('--metier'),
    comportement: flags.includes('--comportement'),
  });
}

async function cmdList() {
  await listCommand();
}

async function cmdEnrich(args) {
  const slug = await pickClone('Quel clone enrichir ?', '📥', args);
  if (!slug) return;

  if (!(await ensureApiKey())) return;
  const config = getConfig();
  await enrichCommand(slug, { provider: config.defaultProvider });
}

async function cmdDelete(args) {
  const slug = await pickClone('Quel clone supprimer ?', '🗑️', args);
  if (!slug) return;

  await deleteCommand(slug);
}

async function cmdStatus(args) {
  const slug = await pickClone('Quel clone inspecter ?', '🔍', args);
  if (!slug) return;

  await statusCommand(slug);
}

async function cmdHistory(args) {
  const slug = await pickClone('Historique de quel clone ?', '📜', args);
  if (!slug) return;

  await historyCommand(slug);
}

async function cmdRollback(args) {
  const slug = await pickClone('Rollback de quel clone ?', '⏪', args);
  if (!slug) return;

  await rollbackCommand(slug, {});
}

async function cmdExport(args) {
  const slug = await pickClone('Quel clone exporter ?', '📦', args);
  if (!slug) return;

  await exportCommand(slug);
}

async function cmdConfig() {
  await configCommand({ show: false, set: undefined });
}

async function cmdModel() {
  const config = getConfig();
  const providers = (await import('../providers/index.js')).listProviders();
  const current = providers.find(p => p.id === config.defaultProvider);

  if (!current) {
    ui.fail('Provider non configure. Lance /config d\'abord.');
    return;
  }

  const { model } = await inquirer.prompt([{
    type: 'list',
    name: 'model',
    message: `Modele ${current.name} :`,
    prefix: '  🧠',
    choices: current.models.map(m => ({
      name: m === config.providers?.[current.id]?.model ? `${m} (actuel)` : m,
      value: m,
    })),
  }]);

  (await import('../utils/config.js')).setConfig(`${current.id}.model`, model);
  ui.ok(`Modele change : ${model}`);
}

async function cmdProvider() {
  const config = getConfig();
  const providers = (await import('../providers/index.js')).listProviders();

  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: 'Fournisseur IA :',
    prefix: '  🤖',
    choices: providers.map(p => ({
      name: p.id === config.defaultProvider ? `${p.name} (actuel)` : p.name,
      value: p.id,
    })),
  }]);

  (await import('../utils/config.js')).setConfig('defaultProvider', provider);
  ui.ok(`Provider change : ${provider}`);

  // Verifier si la cle est configuree
  if (provider !== 'ollama') {
    const key = config.providers?.[provider]?.apiKey;
    if (!key) {
      ui.warn(`Pas de cle API pour ${provider}. Configure-la avec /config`);
    }
  }
}

async function cmdRename(args) {
  const slug = await pickClone('Quel clone renommer ?', '✏️', args);
  if (!slug) return;

  const { newName } = await inquirer.prompt([{
    type: 'input',
    name: 'newName',
    message: 'Nouveau prenom/alias :',
    prefix: '  ✏️',
  }]);

  if (!newName.trim()) {
    ui.info('Annule.');
    return;
  }

  // Renommer = copier + supprimer
  const storage = await import('../storage/index.js');
  const clone = storage.loadClone(slug);

  const newSlug = newName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

  if (storage.cloneExists(newSlug)) {
    ui.fail(`Un clone "/${newSlug}" existe deja.`);
    return;
  }

  storage.initClone(newSlug);
  clone.meta.slug = newSlug;
  clone.meta.prenom = newName.trim();
  clone.meta.mis_a_jour_le = new Date().toISOString();
  storage.saveClone(newSlug, { meta: clone.meta, work: clone.work, persona: clone.persona });
  storage.deleteClone(slug);

  ui.ok(`Renomme : /${slug} → /${newSlug}`);
}

async function cmdQuickChat(slug, message) {
  if (!(await ensureApiKey())) return;
  const config = getConfig();
  const { createProviderAsync } = await import('../providers/index.js');
  const storage = await import('../storage/index.js');
  const { PROMPTS } = await import('../prompts/system.js');

  const clone = storage.loadClone(slug);
  const content = clone.combined || `${clone.work || ''}\n\n---\n\n${clone.persona || ''}`;
  const provider = await createProviderAsync(config.defaultProvider, {
    model: config.providers?.[config.defaultProvider]?.model,
  });

  const systemPrompt = PROMPTS.chatMode(content);
  const response = await provider.complete(systemPrompt, message, { maxTokens: 2048 });
  console.log(`  ${ui.accent(clone.meta?.prenom || slug)} : ${response}`);
}

async function cmdHelp() {
  ui.section('Commandes disponibles');

  const categories = [
    { name: 'Creation et gestion', cmds: ['/clone', '/enrichir', '/chat'] },
    { name: 'Consultation', cmds: ['/liste', '/status', '/historique'] },
    { name: 'Export', cmds: ['/exporter'] },
    { name: 'Configuration', cmds: ['/config', '/modele', '/provider'] },
    { name: 'Gestion', cmds: ['/supprimer', '/renommer', '/rollback'] },
    { name: 'Autre', cmds: ['/aide', '/quitter'] },
  ];

  for (const cat of categories) {
    console.log(chalk.cyan.bold(`  ${cat.name}`));
    for (const cmd of cat.cmds) {
      const def = COMMANDS[cmd];
      const aliases = def.alias ? ui.muted(` (${def.alias.join(', ')})`) : '';
      console.log(`    ${chalk.yellow(cmd.padEnd(16))} ${def.desc}${aliases}`);
    }
    console.log('');
  }

  ui.info('Tu peux aussi taper un slug directement : /chat marie-dupont');
  ui.info('Raccourci : si tu n\'as qu\'un clone, tape ta question directement');
}

async function cmdQuit() {
  ui.blank();
  ui.info('A bientot ! 🦐');
  process.exit(0);
}
