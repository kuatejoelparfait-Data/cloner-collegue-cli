/**
 * RAG (Retrieval Augmented Generation) — version TF-IDF
 *
 * Au lieu d'envoyer TOUS les materiaux bruts au LLM (qui depasse vite le contexte),
 * on :
 *   1. Decoupe les materiaux en chunks (~500 mots, chevauchement 50 mots)
 *   2. Calcule un vecteur TF-IDF pour chaque chunk
 *   3. Au moment de la requete : on embed la question, on garde les top-k chunks
 *      les plus proches (cosine similarity), on les injecte dans le contexte
 *
 * Pas d'API externe necessaire, pur JS. Pour de meilleurs resultats on passerait
 * a des embeddings semantiques (OpenAI, sentence-transformers), mais TF-IDF
 * couvre deja 80% des cas (matching par mots-cles).
 */

import fs from 'fs';
import path from 'path';
import { getClonePath } from '../storage/index.js';

// Parametres de chunking
const CHUNK_SIZE_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;

// Stop words francais et anglais (les plus frequents)
const STOP_WORDS = new Set([
  'le','la','les','un','une','des','de','du','et','ou','a','au','aux','ce','cet','cette','ces',
  'je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','mon','ma','mes',
  'ton','ta','tes','son','sa','ses','notre','nos','votre','vos','leur','leurs',
  'est','sont','etait','etaient','ete','etre','avoir','avait','avaient','eu',
  'pour','par','avec','sans','dans','sur','sous','que','qui','quoi','dont','ou',
  'mais','si','ne','pas','plus','moins','tres','bien','tout','tous','toute','toutes',
  'the','a','an','and','or','of','to','in','on','at','for','by','with','from','as','is','are',
  'was','were','be','been','being','have','has','had','do','does','did','that','this','these',
  'those','it','its','i','you','he','she','we','they','my','your','his','her','our','their',
  'not','no','so','but','if','then','than','there','here','what','which','who','how','when',
]);

/**
 * Tokenize un texte : lowercase, split, supprime stop-words et tokens trop courts
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retirer accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Decoupe un texte en chunks avec chevauchement
 */
export function chunkText(text, { source = 'unknown', chunkSize = CHUNK_SIZE_WORDS, overlap = CHUNK_OVERLAP_WORDS } = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= chunkSize) {
    return [{ text, source, wordCount: words.length }];
  }

  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + chunkSize);
    chunks.push({
      text: slice.join(' '),
      source,
      wordCount: slice.length,
    });
    i += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Calcule le vecteur TF d'un chunk (fréquence des termes)
 * @returns {Map<string, number>}
 */
function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  // Normalisation : diviser par le nombre total de tokens
  const total = tokens.length || 1;
  for (const [k, v] of tf) {
    tf.set(k, v / total);
  }
  return tf;
}

/**
 * Calcule l'IDF sur un corpus de chunks
 * @returns {Map<string, number>}
 */
function inverseDocumentFrequency(chunks) {
  const N = chunks.length;
  const df = new Map();

  for (const chunk of chunks) {
    const unique = new Set(chunk.tokens);
    for (const t of unique) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const idf = new Map();
  for (const [term, count] of df) {
    // Lissage : log((N + 1) / (count + 1)) + 1
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idf;
}

/**
 * Calcule le vecteur TF-IDF d'un chunk a partir du TF et de l'IDF global
 */
function tfidfVector(tf, idf) {
  const vec = new Map();
  for (const [term, freq] of tf) {
    const weight = (idf.get(term) || 0);
    vec.set(term, freq * weight);
  }
  return vec;
}

/**
 * Cosine similarity entre deux vecteurs creux (Map<string, number>)
 */
function cosineSim(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weight] of vecA) {
    normA += weight * weight;
    if (vecB.has(term)) {
      dot += weight * vecB.get(term);
    }
  }
  for (const weight of vecB.values()) {
    normB += weight * weight;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Construit l'index RAG a partir de materiaux bruts
 * @param {string} materials - Texte concatene (meme format que dans materials.js)
 * @returns {object} Index serialisable
 */
export function buildIndex(materials) {
  if (!materials || !materials.trim()) {
    return { version: 1, createdAt: new Date().toISOString(), chunks: [], idf: [] };
  }

  // Separer les sources : on cherche les marqueurs "[Source: ...]"
  const sources = materials.split(/\n\n---\n\n/);
  const rawChunks = [];

  for (const block of sources) {
    const match = block.match(/^\[Source: ([^\]]+)\]\n?/);
    const source = match ? match[1] : 'inconnu';
    const cleaned = match ? block.slice(match[0].length) : block;
    for (const chunk of chunkText(cleaned, { source })) {
      rawChunks.push(chunk);
    }
  }

  // Tokeniser chaque chunk
  const withTokens = rawChunks.map(c => ({ ...c, tokens: tokenize(c.text) }));
  // IDF sur le corpus
  const idf = inverseDocumentFrequency(withTokens);
  // TF-IDF par chunk
  const chunks = withTokens.map(c => ({
    text: c.text,
    source: c.source,
    wordCount: c.wordCount,
    vector: Object.fromEntries(tfidfVector(termFrequency(c.tokens), idf)),
  }));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    chunks,
    idf: Object.fromEntries(idf),
  };
}

/**
 * Persiste l'index sur disque
 */
export function saveIndex(slug, index) {
  const filePath = path.join(getClonePath(slug), 'rag-index.json');
  fs.writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf-8');
  return filePath;
}

/**
 * Charge l'index depuis le disque (ou null si absent)
 */
export function loadIndex(slug) {
  const filePath = path.join(getClonePath(slug), 'rag-index.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Verifie si un index RAG existe pour ce clone
 */
export function hasIndex(slug) {
  return fs.existsSync(path.join(getClonePath(slug), 'rag-index.json'));
}

/**
 * Recherche les top-k chunks les plus pertinents pour une requete
 * @param {object} index - Index charge
 * @param {string} query
 * @param {number} k
 * @returns {Array<{text, source, score}>}
 */
export function retrieve(index, query, k = 5) {
  if (!index || !index.chunks || index.chunks.length === 0) return [];

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const idf = new Map(Object.entries(index.idf || {}));
  const queryTf = termFrequency(tokens);
  const queryVec = tfidfVector(queryTf, idf);

  const scored = index.chunks
    .map(chunk => {
      const chunkVec = new Map(Object.entries(chunk.vector));
      return {
        text: chunk.text,
        source: chunk.source,
        score: cosineSim(queryVec, chunkVec),
      };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored;
}

/**
 * Formate les chunks retrouves en un bloc prompt
 */
export function formatRetrievedContext(chunks) {
  if (!chunks || chunks.length === 0) return '';

  const blocks = chunks.map((c, i) =>
    `[Extrait ${i + 1} — source: ${c.source}, pertinence: ${c.score.toFixed(2)}]\n${c.text}`
  );

  return `\n\n--- CONTEXTE PERTINENT (extraits des materiaux) ---\n${blocks.join('\n\n')}\n--- FIN DU CONTEXTE ---\n`;
}
