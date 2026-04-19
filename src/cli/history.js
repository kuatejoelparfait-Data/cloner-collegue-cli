/**
 * Commande : /historique <slug>
 * Affiche l'historique des versions d'un clone
 */

import { loadClone, cloneExists } from '../storage/index.js';
import { ui } from '../utils/ui.js';

export async function historyCommand(slug) {
  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable.`);
    return;
  }

  const clone = loadClone(slug);
  const meta = clone.meta || {};
  const history = meta.historique_versions || [];

  ui.section(`Historique de /${slug}`);

  if (history.length === 0) {
    ui.info('Aucun historique disponible.');
    return;
  }

  history.forEach((entry, i) => {
    const date = entry.date ? new Date(entry.date).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : '?';

    const isCurrent = i === history.length - 1;
    const marker = isCurrent ? ui.accent(' ← actuelle') : '';
    const icon = isCurrent ? '●' : '○';

    console.log(`  ${icon}  ${ui.bold(`v${entry.version}`)}  ${ui.muted(date)}${marker}`);
    console.log(`     ${entry.resume || '(pas de description)'}`);
    console.log('');
  });

  // Corrections
  const corrections = meta.corrections || [];
  if (corrections.length > 0) {
    console.log(ui.accent(`  ${corrections.length} correction(s) appliquee(s) :`));
    corrections.forEach(c => {
      const date = c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '?';
      console.log(`    ${ui.muted(date)} — ${c.raison || 'correction manuelle'}`);
    });
  }
}
