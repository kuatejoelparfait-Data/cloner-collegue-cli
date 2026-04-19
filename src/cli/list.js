/**
 * Commande : cloner liste
 * Affiche tous les clones disponibles
 */

import { listClones } from '../storage/index.js';
import { ui } from '../utils/ui.js';

export async function listCommand() {
  const clones = listClones();

  if (clones.length === 0) {
    ui.section('Aucun clone');
    ui.info('Cree ton premier clone avec : cloner clone');
    return;
  }

  ui.section(`${clones.length} clone${clones.length > 1 ? 's' : ''} disponible${clones.length > 1 ? 's' : ''}`);

  clones.forEach(clone => {
    const poste = clone.profil?.poste || '';
    const entreprise = clone.profil?.entreprise ? ` chez ${clone.profil.entreprise}` : '';
    const version = clone.version || '1.0';
    const provider = clone.provider || '?';

    console.log(
      `  ${ui.accent(`/${clone.slug}`).padEnd(35)} ` +
      `${clone.prenom || clone.slug} — ${poste}${entreprise} ` +
      `${ui.muted(`(v${version}, ${provider})`)}`
    );
  });

  ui.blank();
  ui.info('Pour discuter : cloner chat <slug>');
  ui.info('Pour enrichir : cloner enrichir <slug>');
}
