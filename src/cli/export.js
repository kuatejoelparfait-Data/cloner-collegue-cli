/**
 * Commande : /exporter <slug>
 * Exporte un clone — avec retour a chaque etape
 */

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadClone, cloneExists, getClonePath } from '../storage/index.js';
import { ui } from '../utils/ui.js';
import os from 'os';

export async function exportCommand(slug) {
  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable.`);
    return;
  }

  const clone = loadClone(slug);
  const prenom = clone.meta?.prenom || slug;

  // Etape 1 — Choix du format
  const { format } = await inquirer.prompt([{
    type: 'list',
    name: 'format',
    message: `Exporter ${prenom} dans quel format ?`,
    prefix: '  📦',
    choices: [
      { name: '📄  Markdown unique — un seul fichier .md', value: 'markdown' },
      { name: '📋  JSON — metadonnees + profil + empreinte', value: 'json' },
      { name: '📁  Dossier complet — copie integrale', value: 'folder' },
      new inquirer.Separator(),
      { name: '↩️   Retour', value: 'back' },
    ],
  }]);

  if (format === 'back') return;

  // Etape 2 — Destination
  const { destination } = await inquirer.prompt([{
    type: 'input',
    name: 'destination',
    message: 'Ou sauvegarder ? (chemin ou vide = Bureau) — /retour pour revenir :',
    prefix: '  📂',
    default: path.join(os.homedir(), 'Desktop'),
  }]);

  const cmd = destination.trim().toLowerCase();
  if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return;

  const destDir = destination.replace(/^["']|["']$/g, '');

  if (!fs.existsSync(destDir)) {
    ui.fail(`Dossier introuvable : ${destDir}`);
    return;
  }

  // Etape 3 — Confirmation
  const { confirm } = await inquirer.prompt([{
    type: 'list',
    name: 'confirm',
    message: `Exporter /${slug} en ${format} vers ${destDir} ?`,
    choices: [
      { name: '✓  Confirmer', value: true },
      { name: '↩️  Retour', value: false },
    ],
  }]);

  if (!confirm) return;

  try {
    if (format === 'markdown') {
      const content = [
        `# Clone de ${prenom}`,
        '',
        `> Genere par Cloner Collegue CLI — v${clone.meta?.version || '?'}`,
        `> Date : ${new Date().toLocaleDateString('fr-FR')}`,
        '',
        '---',
        '',
        '## Profil metier',
        '',
        clone.work || '(vide)',
        '',
        '---',
        '',
        '## Empreinte comportementale',
        '',
        clone.persona || '(vide)',
      ].join('\n');

      const filePath = path.join(destDir, `clone-${slug}.md`);
      fs.writeFileSync(filePath, content, 'utf-8');
      ui.ok(`Exporte : ${filePath}`);

    } else if (format === 'json') {
      const data = {
        _export: {
          tool: 'Cloner Collegue CLI v2',
          date: new Date().toISOString(),
          auteur: 'Kuate Joel Parfait — Digital House Company',
        },
        meta: clone.meta,
        work: clone.work,
        persona: clone.persona,
      };

      const filePath = path.join(destDir, `clone-${slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      ui.ok(`Exporte : ${filePath}`);

    } else if (format === 'folder') {
      const srcDir = getClonePath(slug);
      const targetDir = path.join(destDir, `clone-${slug}`);

      copyDir(srcDir, targetDir);
      ui.ok(`Exporte : ${targetDir}/`);
    }

  } catch (err) {
    ui.fail(`Erreur d'export : ${err.message}`);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
