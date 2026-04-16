#!/usr/bin/env node

/**
 * Cloner Collegue CLI v2
 * Par Kuate Joel Parfait — Digital House Company
 *
 * Clone n'importe quel collegue en double numerique IA.
 *
 * Deux modes :
 *   - Shell interactif : lance "cloner" et tape des /commandes
 *   - CLI classique : "cloner clone", "cloner chat marie-dupont"
 */

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ═══════════════════════════════════════
//  Banner avec la crevette furieuse
// ═══════════════════════════════════════

// Crevette pixel-art — corps courbe, antennes, pinces, oeil fache
const o = chalk.hex('#E08030');  // orange crevette
const d = chalk.hex('#8B4513');  // marron contour
const e = chalk.hex('#1A0800');  // oeil noir
const w = chalk.white.bold;
const c = chalk.cyan.bold;
const g = chalk.gray;
const r = chalk.red.bold;
const y = chalk.yellow;

// Construire le banner proprement — chaque cote a une largeur fixe
const SW = 22; // largeur fixe du bloc crevette (caracteres visibles)
const GAP = 3; // espace entre crevette et cadre

// Crevette : chaque ligne fait exactement SW caracteres visibles (paddee a droite)
const shrimpLines = [
  { raw: `    ${d('╭──╮')}${o('~~')}${d('╮')}`,       vis: 13 },
  { raw: `   ${d('╭╯')}${o('▓▓▓▓')}${d('╰─╮')}`,     vis: 13 },
  { raw: `  ${d('╭╯')}${o(' ▓▓▓▓▓')}${d('╰╮')}`,     vis: 13 },
  { raw: ` ${d('╭╯')}${o('  ▓')}${e('◉')}${o('▓▓▓ ')}${d('│')}`,  vis: 13 },
  { raw: ` ${d('│')}${o('  ▓▓▓▓▓▓ ')}${d('│')}`,      vis: 13 },
  { raw: `${d('╭┤')}${o(' ▓▓▓▓▓▓▓ ')}${d('╰╮')}`,    vis: 14 },
  { raw: `${y('>')}${d('╯')}${o('╰──▓▓▓▓▓▓')}${d('╰╮')}`, vis: 14 },
  { raw: `${y('>')}${d('╲')}${o('  ╭▓▓▓▓▓▓▓')}${d('╰╮')}`, vis: 14 },
  { raw: `${d(' ')}${y('>')}${d('╲╭╯ ')}${o('▓▓▓▓▓▓▓')}${d('│')}`, vis: 14 },
  { raw: `${d(' ╰╯╭╯  ')}${o('╰▓▓▓▓')}${d('╯')}`,    vis: 14 },
  { raw: `${d('   ╰╮')}${o('  ╭──▓▓')}${d('╯')}`,     vis: 13 },
  { raw: `${d('    ╰╮')}${o('╭╯ ▓▓')}${d('╯')}`,      vis: 12 },
  { raw: `${d('     ╰╯')}`,                             vis: 7 },
  { raw: `${d('    ╱╱╲╲')}`,                            vis: 8 },
  { raw: `${d('   ╱╱  ╲╲')}`,                           vis: 9 },
  { raw: ``,                                             vis: 0 },
];

// Cadre droit : chaque ligne interieure = exactement 38 caracteres visibles
// On pre-pad chaque texte a 38 chars AVANT d'appliquer les couleurs
const BW = 38;
const border = '═'.repeat(BW);

function bx(plain, colored) {
  // plain = le texte sans couleur pour mesurer, colored = le meme avec chalk
  const padding = ' '.repeat(Math.max(0, BW - plain.length));
  return c('║') + colored + padding + c('║');
}

const boxLines = [
  bx('  CLONER COLLEGUE  v2.0           ',  `  ${w('CLONER COLLEGUE')}  ${g('v2.0')}           `),
  bx('  LA CREVETTE FURIEUSE            ',  `  ${r('LA CREVETTE FURIEUSE')}            `),
  bx('                                      ',  '                                      '),
  bx('  Transforme tes collegues        ',  `  ${g('Transforme tes collegues')}        `),
  bx('  en doubles numeriques IA        ',  `  ${g('en doubles numeriques IA')}        `),
  bx('                                      ',  '                                      '),
  bx('  /clone   creer un clone         ',  `  ${y('/clone')}   ${g('creer un clone')}         `),
  bx('  /chat    discuter avec un clone ',  `  ${y('/chat')}    ${g('discuter avec un clone')} `),
  bx('  /liste   voir tous les clones   ',  `  ${y('/liste')}   ${g('voir tous les clones')}   `),
  bx('  /aide    toutes les commandes   ',  `  ${y('/aide')}    ${g('toutes les commandes')}   `),
  bx('                                      ',  '                                      '),
  bx('  Par Kuate Joel Parfait          ',  `  ${g('Par')} ${w('Kuate Joel Parfait')}          `),
  bx('  Digital House Company           ',  `  ${g('Digital House Company')}           `),
];

function pad(text, visLen, total) {
  return text + ' '.repeat(Math.max(0, total - visLen));
}

// Assembler : crevette (paddee) + gap + cadre
const totalLines = Math.max(shrimpLines.length, boxLines.length + 2);
const bannerRows = [];

for (let i = 0; i < totalLines; i++) {
  // Crevette
  const sLine = shrimpLines[i] || { raw: '', vis: 0 };
  const leftPart = pad(sLine.raw, sLine.vis, SW);
  const spacer = ' '.repeat(GAP);

  // Cadre
  let rightPart = '';
  if (i === 0) {
    rightPart = c('╔' + border + '╗');
  } else if (i === totalLines - 1) {
    rightPart = c('╚' + border + '╝');
  } else if (i - 1 >= 0 && i - 1 < boxLines.length) {
    rightPart = boxLines[i - 1];
  } else {
    rightPart = c('║') + ' '.repeat(BW) + c('║');
  }

  bannerRows.push('  ' + leftPart + spacer + rightPart);
}

const BANNER = '\n' + bannerRows.join('\n') + '\n';

// ═══════════════════════════════════════
//  Detection du mode
// ═══════════════════════════════════════

const hasSubcommand = process.argv.length > 2 && !process.argv[2].startsWith('-');

if (hasSubcommand) {
  // ── Mode CLI classique ──
  runCLI();
} else {
  // ── Mode Shell interactif ──
  runShell();
}

// ═══════════════════════════════════════
//  Mode CLI classique (commander.js)
// ═══════════════════════════════════════

async function runCLI() {
  // ═══ VERROU API ═══
  // Verifier la cle avant toute commande (sauf config et liste)
  const cmdArg = process.argv[2]?.toLowerCase();
  const noKeyNeeded = ['config', 'liste', 'ls', 'status', 's', 'historique', 'h', 'supprimer', 'rm', 'exporter', 'exp'];
  if (!noKeyNeeded.includes(cmdArg)) {
    const { ensureApiKey } = await import('../src/cli/api-gate.js');
    await ensureApiKey();
  }

  const { cloneCommand } = await import('../src/cli/clone.js');
  const { listCommand } = await import('../src/cli/list.js');
  const { chatCommand } = await import('../src/cli/chat.js');
  const { configCommand } = await import('../src/cli/config-cmd.js');
  const { enrichCommand } = await import('../src/cli/enrich.js');
  const { deleteCommand } = await import('../src/cli/delete.js');
  const { statusCommand } = await import('../src/cli/status.js');
  const { exportCommand } = await import('../src/cli/export.js');
  const { historyCommand } = await import('../src/cli/history.js');

  const program = new Command();

  program
    .name('cloner')
    .description('Clone tes collegues en doubles numeriques IA')
    .version('2.0.0');

  program
    .command('clone').alias('c')
    .description('Creer un nouveau clone')
    .option('-p, --provider <provider>', 'Fournisseur IA (claude, openai, mistral, ollama)')
    .option('-m, --model <model>', 'Modele a utiliser')
    .action(cloneCommand);

  program
    .command('enrichir <slug>').alias('e')
    .description('Ajouter des materiaux a un clone existant')
    .option('-p, --provider <provider>', 'Fournisseur IA')
    .action(enrichCommand);

  program
    .command('chat <slug>').alias('t')
    .description('Discuter avec un clone')
    .option('-p, --provider <provider>', 'Fournisseur IA')
    .option('-m, --model <model>', 'Modele a utiliser')
    .option('--metier', 'Profil metier uniquement')
    .option('--comportement', 'Empreinte comportementale uniquement')
    .action(chatCommand);

  program
    .command('liste').alias('ls')
    .description('Voir tous les clones')
    .action(listCommand);

  program
    .command('status <slug>').alias('s')
    .description('Infos detaillees d\'un clone')
    .action(statusCommand);

  program
    .command('historique <slug>').alias('h')
    .description('Historique des versions')
    .action(historyCommand);

  program
    .command('exporter <slug>').alias('exp')
    .description('Exporter un clone')
    .action(exportCommand);

  program
    .command('supprimer <slug>').alias('rm')
    .description('Supprimer un clone')
    .action(deleteCommand);

  program
    .command('config')
    .description('Configurer les cles API et preferences')
    .option('--set <cle=valeur>', 'Definir une valeur')
    .option('--show', 'Afficher la configuration')
    .action(configCommand);

  program.parse();
}

// ═══════════════════════════════════════
//  Mode Shell interactif
// ═══════════════════════════════════════

async function runShell() {
  console.log(BANNER);

  // Premier lancement ?
  const { isFirstLaunch, runOnboarding } = await import('../src/cli/onboarding.js');

  if (isFirstLaunch()) {
    await runOnboarding();
  } else {
    console.log(chalk.gray('  Tape /aide pour voir les commandes, /clone pour commencer\n'));
  }

  // ═══ VERROU API ═══
  // Avant TOUTE utilisation, s'assurer qu'une cle API est configuree
  const { ensureApiKey } = await import('../src/cli/api-gate.js');
  await ensureApiKey();

  // Lancer le shell
  const { startShell } = await import('../src/cli/shell.js');
  await startShell();
}
