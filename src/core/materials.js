/**
 * Module de collecte des materiaux
 * Import de fichiers, messages et texte avec navigation retour
 */

import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { ui } from '../utils/ui.js';
import { saveKnowledge } from '../storage/index.js';
import { getConfig } from '../utils/config.js';
import { getProviderInfo } from '../providers/index.js';
import { wordsForContext, truncateToWords, countWords, estimateTokens, formatTokens } from '../utils/tokens.js';
import { extractText } from './file-parser.js';

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
    return allMaterials;
  }

  const wordCount = countWords(allMaterials);
  const tokenEstimate = estimateTokens(allMaterials);
  ui.ok(`Total : ${wordCount} mots (~${formatTokens(tokenEstimate)} tokens) en ${collected.length} source(s)`);

  // Calcul de la limite dynamique selon le modele actif
  const cfg = getConfig();
  const providerId = cfg.defaultProvider || 'claude';
  const providerInfo = getProviderInfo(providerId);
  const maxWords = wordsForContext(providerInfo);
  const providerName = providerInfo?.name || providerId;
  const ctxK = Math.floor((providerInfo?.contextWindow || 8192) / 1000);

  if (wordCount > maxWords) {
    ui.warn(`Depasse la capacite du modele ${providerName} (${ctxK}K tokens de contexte).`);
    ui.warn(`Limite utilisable : ~${maxWords} mots (70% du contexte reserve aux materiaux).`);
    ui.info('Troncature automatique pour tenir dans le contexte du LLM.');
    ui.info(`Astuce : utilise un modele avec plus de contexte (Claude = 200K, GPT-4o = 128K).`);
    return truncateToWords(allMaterials, maxWords);
  }

  // Informer l'utilisateur qu'il est dans la bonne zone
  const usagePercent = Math.round((tokenEstimate / (providerInfo?.contextWindow || 8192)) * 100);
  if (usagePercent > 50) {
    ui.info(`Utilisation du contexte : ${usagePercent}% (modele ${providerName})`);
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

  // Verifier la taille du fichier (max 10 Mo pour PDF/DOCX, 5 Mo pour texte)
  const MAX_FILE_SIZE = ext === '.pdf' || ext === '.docx' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  try {
    const stats = fs.statSync(cleanPath);
    if (stats.size > MAX_FILE_SIZE) {
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      const limitMB = MAX_FILE_SIZE / 1024 / 1024;
      ui.warn(`Fichier trop volumineux : ${sizeMB} Mo (max ${limitMB} Mo).`);
      ui.info('Astuce : decoupe le fichier ou copie-colle les passages pertinents.');
      return null;
    }
  } catch {
    // On continue, l'erreur sera attrapee ensuite
  }

  // Extraction de texte selon le format du fichier
  const result = await extractText(cleanPath);

  if (!result.ok) {
    ui.warn(result.error);
    return null;
  }

  const content = result.content;

  if (result.warning) {
    ui.info(result.warning);
  }

  // Determiner la categorie de stockage
  let category = 'documents';
  if (ext === '.eml' || ext === '.mbox') category = 'emails';
  else if (ext === '.txt' || ext === '.md') category = 'notes';

  // On sauvegarde le texte extrait (pas le binaire original)
  // Pour les PDF/DOCX, on change l'extension a .txt pour refleter le contenu reel
  const savedName = (ext === '.pdf' || ext === '.docx')
    ? filename.replace(/\.(pdf|docx)$/i, '.txt')
    : filename;

  saveKnowledge(slug, category, savedName, content);

  const wordCount = countWords(content);
  const tokenEst = estimateTokens(content);
  ui.ok(`Recu : ${filename} (${wordCount} mots, ~${formatTokens(tokenEst)} tokens)`);

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
