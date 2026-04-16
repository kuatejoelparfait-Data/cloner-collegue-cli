/**
 * Commande : /supprimer <slug>
 * Supprime un clone — avec retour a chaque etape
 */

import inquirer from 'inquirer';
import { deleteClone, cloneExists, loadClone } from '../storage/index.js';
import { ui } from '../utils/ui.js';

export async function deleteCommand(slug) {
  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable.`);
    return;
  }

  const clone = loadClone(slug);
  const prenom = clone.meta?.prenom || slug;

  // Etape 1 — Confirmation avec retour
  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: `Supprimer le clone de ${prenom} (/${slug}) ? C'est irreversible.`,
    prefix: '  🗑️',
    choices: [
      { name: `✓  Oui, supprimer /${slug}`, value: 'confirm' },
      { name: '↩️  Non, retour', value: 'back' },
    ],
  }]);

  if (action === 'back') return;

  // Etape 2 — Double confirmation par saisie
  const { typed } = await inquirer.prompt([{
    type: 'input',
    name: 'typed',
    message: `Tape "${slug}" pour confirmer (ou /retour) :`,
    prefix: '  ⚠️',
  }]);

  const cmd = typed.trim().toLowerCase();
  if (cmd === '/retour' || cmd === '/back' || cmd === '/r') {
    ui.info('Suppression annulee.');
    return;
  }

  if (typed.trim() !== slug) {
    ui.info('Le slug ne correspond pas. Suppression annulee.');
    return;
  }

  deleteClone(slug);
  ui.ok(`Clone "/${slug}" supprime.`);
}
