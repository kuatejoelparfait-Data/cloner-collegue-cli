/**
 * Extracteur de texte multi-formats
 * Supporte : .txt, .md, .eml, .mbox, .html, .csv (natif)
 *            .pdf (pdf-parse)
 *            .docx (mammoth)
 *
 * Les formats binaires non supportes (.doc, .xlsx, .pptx) sont detectes et refuses proprement.
 */

import fs from 'fs';
import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst',
  '.eml', '.mbox',
  '.html', '.htm',
  '.csv', '.tsv',
  '.log', '.json', '.xml', '.yaml', '.yml',
]);

const BINARY_UNSUPPORTED = new Set([
  '.doc',   // ancien Word — format binaire proprietaire
  '.xls',   // ancien Excel
  '.ppt',   // ancien PowerPoint
  '.xlsx',  // Excel moderne
  '.pptx',  // PowerPoint moderne
  '.odt',   // OpenDocument Text (format ZIP complexe)
  '.rtf',   // Rich Text Format
  '.ai', '.psd', '.sketch', '.fig', // Design
  '.mp3', '.mp4', '.wav', '.avi', '.mov', // Media
  '.zip', '.tar', '.gz', '.rar', '.7z', // Archives
  '.exe', '.dll', '.so', '.dylib', // Binaires
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', // Images
]);

/**
 * Extrait le texte d'un fichier selon son extension.
 * Retourne { ok: boolean, content: string, error?: string, warning?: string }
 *
 * @param {string} filePath
 * @returns {Promise<{ok: boolean, content?: string, error?: string, warning?: string}>}
 */
export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  // Verifier que le fichier existe
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Fichier introuvable : ${filePath}` };
  }

  // Formats binaires non supportes — rejet immediat
  if (BINARY_UNSUPPORTED.has(ext)) {
    return {
      ok: false,
      error: `Format ${ext} non supporte. Formats acceptes : .txt, .md, .pdf, .docx, .eml, .html, .csv`,
    };
  }

  // PDF
  if (ext === '.pdf') {
    return await extractPdf(filePath);
  }

  // DOCX (Word moderne)
  if (ext === '.docx') {
    return await extractDocx(filePath);
  }

  // Texte natif (txt, md, eml, html, etc.)
  if (TEXT_EXTENSIONS.has(ext) || ext === '') {
    return extractPlainText(filePath);
  }

  // Extension inconnue : tenter lecture UTF-8 avec avertissement
  const plain = extractPlainText(filePath);
  if (plain.ok) {
    return {
      ...plain,
      warning: `Extension ${ext || '(aucune)'} non reconnue, lu comme texte brut. Verifie le resultat.`,
    };
  }
  return plain;
}

/**
 * Lecture d'un PDF via pdf-parse
 */
async function extractPdf(filePath) {
  try {
    // Import dynamique pour eviter le chargement si pas utilise
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    if (!data.text || !data.text.trim()) {
      return {
        ok: false,
        error: 'PDF vide ou scanne (pas de texte extractible). Utilise un OCR prealable.',
      };
    }

    // Nettoyage basique : enlever les sauts de page parasites
    const cleaned = data.text
      .replace(/\f/g, '\n\n') // form feeds → double saut
      .replace(/\n{3,}/g, '\n\n') // max 2 sauts consecutifs
      .trim();

    return {
      ok: true,
      content: cleaned,
      warning: data.numpages > 1 ? `${data.numpages} pages extraites` : undefined,
    };
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return {
        ok: false,
        error: 'La librairie pdf-parse n\'est pas installee. Lance : npm install',
      };
    }
    return {
      ok: false,
      error: `Erreur de lecture du PDF : ${err.message}`,
    };
  }
}

/**
 * Lecture d'un DOCX via mammoth
 */
async function extractDocx(filePath) {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ path: filePath });

    if (!result.value || !result.value.trim()) {
      return { ok: false, error: 'Document Word vide.' };
    }

    const cleaned = result.value
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const warnings = result.messages?.length
      ? `${result.messages.length} avertissement(s) de formatage ignores`
      : undefined;

    return { ok: true, content: cleaned, warning: warnings };
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return {
        ok: false,
        error: 'La librairie mammoth n\'est pas installee. Lance : npm install',
      };
    }
    return {
      ok: false,
      error: `Erreur de lecture du DOCX : ${err.message}`,
    };
  }
}

/**
 * Lecture d'un fichier texte (UTF-8)
 */
function extractPlainText(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Detection heuristique de binaire : trop de caracteres de controle
    const controlChars = (content.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    const ratio = controlChars / Math.max(content.length, 1);
    if (ratio > 0.05) {
      return {
        ok: false,
        error: 'Le fichier semble binaire (trop de caracteres non imprimables).',
      };
    }

    return { ok: true, content };
  } catch (err) {
    return {
      ok: false,
      error: `Impossible de lire le fichier : ${err.message}`,
    };
  }
}

/**
 * Retourne la liste des formats supportes (pour l'aide)
 */
export function getSupportedFormats() {
  return {
    text: ['.txt', '.md', '.eml', '.html', '.csv', '.json'],
    rich: ['.pdf', '.docx'],
    unsupported: Array.from(BINARY_UNSUPPORTED),
  };
}
