/**
 * Module de collecte des materiaux
 * Import de fichiers, messages et texte avec navigation retour
 */

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { ui } from '../utils/ui.js';
import { saveKnowledge } from '../storage/index.js';

/**
 * Collecte interactive des materiaux
 * @param {string} slug
 * @returns {string} Materiaux concatenes
 */
export async function collectMaterials(slug) {
  ui.section('Phase 2 — Import des materiaux');
  console.log(ui.muted('  Tu peux importer autant de sources que tu veux.'));
  console.log(ui.muted('  Tape /retour pour revenir au menu, /passer pour sauter cette etape.\n'));

  const collected = [];
  let collecting = true;

  while (collecting) {
    const { method } = await inquirer.prompt([{
      type: 'list',
      name: 'method',
      message: `Comment importer ? (${collected.length} source${collected.length > 1 ? 's' : ''} deja)`,
      prefix: '  📥',
      choices: [
        { name: '📁  Fichier(s) — PDF, Word, Markdown, .txt, .eml', value: 'file' },
        { name: '💬  Messages copies — colle du texte (Slack, Teams, WhatsApp)', value: 'paste' },
        { name: '✍️   Texte libre — decris toi-meme comment il/elle travaille', value: 'text' },
        new inquirer.Separator(),
        { name: collected.length > 0
            ? `✅  Termine — j'ai tout fourni (${collected.length} source${collected.length > 1 ? 's' : ''})`
            : '⏭️   Passer — pas de materiaux pour le moment',
          value: 'done' },
        { name: '↩️   Retour — revenir a l\'etape precedente', value: 'back' },
      ],
    }]);

    if (method === 'done') {
      collecting = false;
      continue;
    }

    if (method === 'back') {
      return null; // Signal de retour pour l'appelant
    }

    let content = null;

    if (method === 'file') {
      content = await importFile(slug);
    } else if (method === 'paste') {
      content = await importPaste(slug);
    } else if (method === 'text') {
      content = await importFreeText(slug);
    }

    if (content) {
      collected.push(content);
    }
  }

  const allMaterials = collected.join('\n\n---\n\n');

  if (!allMaterials.trim()) {
    ui.warn('Aucun materiau. Le clone sera base uniquement sur les tags de personnalite.');
    ui.warn('Le resultat sera generique. Ajoute des materiaux avec /enrichir pour ameliorer.');
  } else {
    const wordCount = allMaterials.split(/\s+/).length;
    ui.ok(`Total : ${wordCount} mots collectes en ${collected.length} source(s)`);

    // Avertissement si trop de mots (risque de depasser le contexte LLM)
    const MAX_WORDS = 50000;
    if (wordCount > MAX_WORDS) {
      ui.warn(`Attention : ${wordCount} mots depasse la limite recommandee (${MAX_WORDS}).`);
      ui.info('Les materiaux seront tronques pour tenir dans le contexte du LLM.');
      return allMaterials.split(/\s+/).slice(0, MAX_WORDS).join(' ');
    }
  }

  return allMaterials;
}

/**
 * Import d'un fichier
 */
async function importFile(slug) {
  const { filePath } = await inquirer.prompt([{
    type: 'input',
    name: 'filePath',
    message: 'Chemin du fichier (ou /retour) :',
    prefix: '  📁',
    validate: (v) => {
      const cmd = v.trim().toLowerCase();
      if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return true;
      if (!v.trim()) return 'Chemin requis';
      const clean = v.replace(/^["']|["']$/g, '');
      if (!fs.existsSync(clean)) return `Fichier introuvable : ${clean}`;
      return true;
    },
  }]);

  const cmd = filePath.trim().toLowerCase();
  if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return null;

  const cleanPath = filePath.replace(/^["']|["']$/g, '');
  const filename = path.basename(cleanPath);
  const ext = path.extname(cleanPath).toLowerCase();

  // Verifier la taille du fichier (max 5 Mo)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  try {
    const stats = fs.statSync(cleanPath);
    if (stats.size > MAX_FILE_SIZE) {
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      ui.warn(`Fichier trop volumineux : ${sizeMB} Mo (max 5 Mo).`);
      ui.info('Astuce : decoupe le fichier ou copie-colle les passages pertinents.');
      return null;
    }
  } catch {
    // On continue, l'erreur sera attrapee par readFileSync
  }

  let content;
  try {
    content = fs.readFileSync(cleanPath, 'utf-8');
  } catch {
    ui.warn(`Impossible de lire ${filename} en texte.`);
    return null;
  }

  const category = ext === '.eml' || ext === '.mbox' ? 'emails' : 'documents';
  saveKnowledge(slug, category, filename, content);

  const wordCount = content.split(/\s+/).length;
  ui.ok(`Recu : ${filename} (${wordCount} mots)`);

  return `[Source: ${filename}]\n${content}`;
}

/**
 * Import de messages colles
 */
async function importPaste(slug) {
  const { confirm } = await inquirer.prompt([{
    type: 'list',
    name: 'confirm',
    message: 'Coller des messages (ouvre un editeur) :',
    prefix: '  💬',
    choices: [
      { name: '📝  Ouvrir l\'editeur', value: 'open' },
      { name: '↩️   Annuler — revenir au choix de methode', value: 'back' },
    ],
  }]);

  if (confirm === 'back') return null;

  const { content } = await inquirer.prompt([{
    type: 'editor',
    name: 'content',
    message: 'Messages :',
    prefix: '  💬',
  }]);

  if (!content.trim()) {
    ui.warn('Rien recu.');
    return null;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `messages-${timestamp}-${Date.now() % 10000}.txt`;
  saveKnowledge(slug, 'messages', filename, content);

  const wordCount = content.split(/\s+/).length;
  ui.ok(`Recu : ${wordCount} mots de messages`);

  return `[Source: messages colles]\n${content}`;
}

/**
 * Import de texte libre
 */
async function importFreeText(slug) {
  const { confirm } = await inquirer.prompt([{
    type: 'list',
    name: 'confirm',
    message: 'Ecrire une description (ouvre un editeur) :',
    prefix: '  ✍️',
    choices: [
      { name: '📝  Ouvrir l\'editeur', value: 'open' },
      { name: '↩️   Annuler — revenir au choix de methode', value: 'back' },
    ],
  }]);

  if (confirm === 'back') return null;

  const { content } = await inquirer.prompt([{
    type: 'editor',
    name: 'content',
    message: 'Description :',
    prefix: '  ✍️',
  }]);

  if (!content.trim()) {
    ui.warn('Rien recu.');
    return null;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `notes-${timestamp}-${Date.now() % 10000}.txt`;
  saveKnowledge(slug, 'notes', filename, content);

  const wordCount = content.split(/\s+/).length;
  ui.ok(`Recu : ${wordCount} mots de description`);

  return `[Source: description libre]\n${content}`;
}
