/**
 * Gestion du stockage des clones
 * Chaque clone vit dans colleagues/{slug}/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const COLLEAGUES_DIR = path.join(ROOT, 'colleagues');

/**
 * Retourne le chemin du dossier d'un clone
 */
export function getClonePath(slug) {
  return path.join(COLLEAGUES_DIR, slug);
}

/**
 * Verifie si un clone existe
 */
export function cloneExists(slug) {
  const metaPath = path.join(getClonePath(slug), 'meta.json');
  return fs.existsSync(metaPath);
}

/**
 * Cree la structure de dossiers pour un nouveau clone
 */
export function initClone(slug) {
  const base = getClonePath(slug);
  const dirs = [
    base,
    path.join(base, 'versions'),
    path.join(base, 'knowledge', 'emails'),
    path.join(base, 'knowledge', 'messages'),
    path.join(base, 'knowledge', 'documents'),
    path.join(base, 'knowledge', 'notes'),
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  return base;
}

/**
 * Sauvegarde les fichiers d'un clone
 */
export function saveClone(slug, data) {
  const base = getClonePath(slug);

  // Ecrire meta.json
  if (data.meta) {
    fs.writeFileSync(
      path.join(base, 'meta.json'),
      JSON.stringify(data.meta, null, 2),
      'utf-8'
    );
  }

  // Ecrire work.md
  if (data.work) {
    fs.writeFileSync(path.join(base, 'work.md'), data.work, 'utf-8');
  }

  // Ecrire persona.md
  if (data.persona) {
    fs.writeFileSync(path.join(base, 'persona.md'), data.persona, 'utf-8');
  }

  // Ecrire le clone complet (work + persona combines)
  if (data.work && data.persona) {
    const combined = `# ${data.meta?.prenom || slug}\n\n` +
      `> Tu es maintenant ${data.meta?.prenom || slug}. ` +
      `Quand quelqu'un te parle, tu reponds et travailles exactement comme lui/elle.\n\n` +
      `---\n\n${data.work}\n\n---\n\n${data.persona}`;
    fs.writeFileSync(path.join(base, 'clone.md'), combined, 'utf-8');
  }
}

/**
 * Cree un snapshot de version
 */
export function snapshotVersion(slug, version) {
  const base = getClonePath(slug);
  const versionDir = path.join(base, 'versions', `v${version}`);

  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
  }

  const filesToCopy = ['work.md', 'persona.md', 'meta.json'];
  filesToCopy.forEach(file => {
    const src = path.join(base, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(versionDir, file));
    }
  });
}

/**
 * Charge les donnees d'un clone existant
 */
export function loadClone(slug) {
  const base = getClonePath(slug);

  const result = { slug };

  const metaPath = path.join(base, 'meta.json');
  if (fs.existsSync(metaPath)) {
    result.meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  const workPath = path.join(base, 'work.md');
  if (fs.existsSync(workPath)) {
    result.work = fs.readFileSync(workPath, 'utf-8');
  }

  const personaPath = path.join(base, 'persona.md');
  if (fs.existsSync(personaPath)) {
    result.persona = fs.readFileSync(personaPath, 'utf-8');
  }

  const clonePath = path.join(base, 'clone.md');
  if (fs.existsSync(clonePath)) {
    result.combined = fs.readFileSync(clonePath, 'utf-8');
  }

  return result;
}

/**
 * Liste tous les clones disponibles
 */
export function listClones() {
  if (!fs.existsSync(COLLEAGUES_DIR)) return [];

  return fs.readdirSync(COLLEAGUES_DIR)
    .filter(name => {
      const metaPath = path.join(COLLEAGUES_DIR, name, 'meta.json');
      return fs.existsSync(metaPath);
    })
    .map(name => {
      const meta = JSON.parse(
        fs.readFileSync(path.join(COLLEAGUES_DIR, name, 'meta.json'), 'utf-8')
      );
      return { slug: name, ...meta };
    });
}

/**
 * Supprime un clone
 */
export function deleteClone(slug) {
  const base = getClonePath(slug);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Sauvegarde l'historique de chat d'un clone
 */
export function saveChatHistory(slug, messages) {
  const filePath = path.join(getClonePath(slug), 'chat_history.json');
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');
}

/**
 * Charge l'historique de chat d'un clone
 */
export function loadChatHistory(slug) {
  const filePath = path.join(getClonePath(slug), 'chat_history.json');
  if (fs.existsSync(filePath)) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
    catch { return []; }
  }
  return [];
}

/**
 * Supprime l'historique de chat d'un clone
 */
export function deleteChatHistory(slug) {
  const filePath = path.join(getClonePath(slug), 'chat_history.json');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Sauvegarde un materiau dans le dossier knowledge/
 */
export function saveKnowledge(slug, category, filename, content) {
  const dir = path.join(getClonePath(slug), 'knowledge', category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
