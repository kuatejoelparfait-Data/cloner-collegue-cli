/**
 * Commande : /status <slug>
 * Affiche les infos detaillees d'un clone
 */

import fs from 'fs';
import path from 'path';
import { loadClone, cloneExists, getClonePath } from '../storage/index.js';
import { ui } from '../utils/ui.js';

export async function statusCommand(slug) {
  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable.`);
    return;
  }

  const clone = loadClone(slug);
  const meta = clone.meta || {};
  const basePath = getClonePath(slug);

  ui.section(`Status de /${slug}`);

  // Infos generales
  ui.table([
    ['Prenom', meta.prenom || slug],
    ['Slug', `/${meta.slug || slug}`],
    ['Version', `v${meta.version || '?'}`],
    ['Cree le', formatDate(meta.cree_le)],
    ['Mis a jour', formatDate(meta.mis_a_jour_le)],
  ]);

  ui.blank();

  // Profil
  if (meta.profil) {
    ui.table([
      ['Entreprise', meta.profil.entreprise || '(non renseigne)'],
      ['Poste', meta.profil.poste || '(non renseigne)'],
      ['Niveau', meta.profil.niveau || '(non renseigne)'],
      ['Genre', meta.profil.genre || '(non renseigne)'],
    ]);
    ui.blank();
  }

  // Tags
  if (meta.mbti) ui.info(`MBTI : ${meta.mbti}`);
  if (meta.tags_personnalite?.length) ui.info(`Personnalite : ${meta.tags_personnalite.join(', ')}`);
  if (meta.tags_culture?.length) ui.info(`Culture : ${meta.tags_culture.join(', ')}`);
  if (meta.impression) ui.info(`Impression : "${meta.impression}"`);
  ui.blank();

  // Fichiers
  const files = ['work.md', 'persona.md', 'clone.md', 'meta.json'];
  console.log(ui.accent('  Fichiers :'));
  for (const file of files) {
    const filePath = path.join(basePath, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const size = formatSize(stats.size);
      const content = fs.readFileSync(filePath, 'utf-8');
      const words = content.split(/\s+/).length;
      ui.ok(`${file} (${words} mots, ${size})`);
    } else {
      ui.warn(`${file} (manquant)`);
    }
  }

  ui.blank();

  // Materiaux sources
  const knowledgePath = path.join(basePath, 'knowledge');
  if (fs.existsSync(knowledgePath)) {
    const categories = ['emails', 'messages', 'documents', 'notes'];
    let totalSources = 0;

    console.log(ui.accent('  Sources :'));
    for (const cat of categories) {
      const catPath = path.join(knowledgePath, cat);
      if (fs.existsSync(catPath)) {
        const files = fs.readdirSync(catPath).filter(f => !f.startsWith('.'));
        if (files.length > 0) {
          totalSources += files.length;
          ui.ok(`${cat}/ — ${files.length} fichier(s)`);
        }
      }
    }

    if (totalSources === 0) {
      ui.info('Aucune source importee');
    }
  }

  ui.blank();

  // Versions
  const versionsPath = path.join(basePath, 'versions');
  if (fs.existsSync(versionsPath)) {
    const versions = fs.readdirSync(versionsPath).filter(f => !f.startsWith('.'));
    if (versions.length > 0) {
      ui.info(`${versions.length} version(s) archivee(s) : ${versions.join(', ')}`);
    }
  }

  // Provider utilise
  if (meta.provider) {
    ui.info(`Genere avec : ${meta.provider} (${meta.model || '?'})`);
  }
}

function formatDate(iso) {
  if (!iso) return '(inconnu)';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
