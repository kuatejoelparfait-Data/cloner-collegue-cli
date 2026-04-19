/**
 * Commande : /rollback <slug>
 * Restaure un clone a une version anterieure (dans versions/)
 *
 * Les snapshots sont crees automatiquement :
 *   - a la creation initiale (v1.0)
 *   - avant chaque enrichissement (v de l'ancienne)
 *
 * Le rollback :
 *   1. Snapshot la version actuelle d'abord (pour pouvoir revenir)
 *   2. Copie les fichiers de la version choisie vers la racine du clone
 *   3. Met a jour meta.json (version active + historique)
 */

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadClone, cloneExists, getClonePath, saveClone, snapshotVersion } from '../storage/index.js';
import { ui } from '../utils/ui.js';

/**
 * Liste les versions disponibles dans versions/
 */
function listAvailableVersions(slug) {
  const versionsDir = path.join(getClonePath(slug), 'versions');
  if (!fs.existsSync(versionsDir)) return [];

  return fs.readdirSync(versionsDir)
    .filter(name => name.startsWith('v'))
    .map(name => {
      const dir = path.join(versionsDir, name);
      const stats = fs.statSync(dir);
      const metaPath = path.join(dir, 'meta.json');
      let resume = '(pas de description)';
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          resume = meta.historique_versions?.slice(-1)?.[0]?.resume || resume;
        } catch { /* ignore */ }
      }
      return {
        version: name.slice(1), // retire le "v"
        date: stats.mtime,
        resume,
      };
    })
    .sort((a, b) => parseFloat(b.version) - parseFloat(a.version));
}

export async function rollbackCommand(slug, options = {}) {
  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable.`);
    return;
  }

  const clone = loadClone(slug);
  const currentVersion = clone.meta?.version || '?';

  const versions = listAvailableVersions(slug);
  if (versions.length === 0) {
    ui.warn(`Aucune version archivee pour /${slug}.`);
    ui.info('Les snapshots sont crees automatiquement a chaque enrichissement.');
    return;
  }

  ui.section(`Rollback de /${slug}`);
  ui.info(`Version actuelle : v${currentVersion}`);

  // Si --version fourni, on l'utilise directement
  let targetVersion = options.version;

  if (!targetVersion) {
    const choices = versions.map(v => ({
      name: `v${v.version}  ${ui.muted(new Date(v.date).toLocaleDateString('fr-FR'))}  — ${v.resume}`,
      value: v.version,
      disabled: v.version === currentVersion ? '(version actuelle)' : false,
    }));
    choices.push(new inquirer.Separator(), { name: '↩️  Annuler', value: null });

    const { chosen } = await inquirer.prompt([{
      type: 'list',
      name: 'chosen',
      message: 'Vers quelle version revenir ?',
      prefix: '  ⏪',
      choices,
    }]);

    if (!chosen) {
      ui.info('Rollback annule.');
      return;
    }
    targetVersion = chosen;
  }

  // Verifier que la version cible existe
  const versionExists = versions.find(v => v.version === targetVersion);
  if (!versionExists) {
    ui.fail(`Version v${targetVersion} introuvable. Disponibles : ${versions.map(v => 'v' + v.version).join(', ')}`);
    return;
  }

  if (targetVersion === currentVersion) {
    ui.warn('Deja sur cette version, rien a faire.');
    return;
  }

  // Confirmation (sauf si --yes)
  if (!options.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'list',
      name: 'confirm',
      message: `Restaurer /${slug} a la version v${targetVersion} ? (la version actuelle sera archivee)`,
      prefix: '  ⚠️',
      choices: [
        { name: `✅  Oui, restaurer v${targetVersion}`, value: 'yes' },
        { name: '❌  Non, annuler', value: 'no' },
      ],
    }]);
    if (confirm !== 'yes') {
      ui.info('Rollback annule.');
      return;
    }
  }

  try {
    // 1. Snapshot de la version actuelle pour pouvoir revenir
    snapshotVersion(slug, currentVersion);

    // 2. Copier les fichiers de la version cible vers la racine
    const base = getClonePath(slug);
    const versionDir = path.join(base, 'versions', `v${targetVersion}`);
    const filesToRestore = ['work.md', 'persona.md'];

    for (const file of filesToRestore) {
      const src = path.join(versionDir, file);
      const dst = path.join(base, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }

    // 3. Mettre a jour meta.json (garder l'historique complet, juste changer la version active)
    const restoredClone = loadClone(slug);
    const newMeta = {
      ...clone.meta,
      version: targetVersion,
      mis_a_jour_le: new Date().toISOString(),
      historique_versions: [
        ...(clone.meta?.historique_versions || []),
        {
          version: targetVersion,
          date: new Date().toISOString(),
          resume: `Rollback depuis v${currentVersion}`,
        },
      ],
    };

    saveClone(slug, {
      meta: newMeta,
      work: restoredClone.work,
      persona: restoredClone.persona,
    });

    ui.ok(`Clone /${slug} restaure a v${targetVersion} (depuis v${currentVersion}).`);
    ui.info(`La version v${currentVersion} reste archivee dans versions/ — /rollback pour y retourner.`);
  } catch (error) {
    ui.fail(`Erreur pendant le rollback : ${error.message}`);
  }
}
