/**
 * Module de collecte des informations de base
 * Pose 3 questions interactives avec navigation retour
 */

import inquirer from 'inquirer';
import { ui } from '../utils/ui.js';

const BACK = Symbol('BACK');
const CANCEL = Symbol('CANCEL');

/**
 * Genere un slug a partir d'un prenom/nom
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Pose une question avec support de /retour et /annuler
 */
async function ask(config) {
  const result = await inquirer.prompt([{
    ...config,
    validate: (v) => {
      const cmd = v.trim().toLowerCase();
      if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return true;
      if (cmd === '/annuler' || cmd === '/cancel' || cmd === '/x') return true;
      if (config.validate) return config.validate(v);
      return true;
    },
  }]);

  const val = result[config.name]?.trim?.() || result[config.name];
  const cmd = typeof val === 'string' ? val.toLowerCase() : '';

  if (cmd === '/retour' || cmd === '/back' || cmd === '/r') return BACK;
  if (cmd === '/annuler' || cmd === '/cancel' || cmd === '/x') return CANCEL;

  return val;
}

/**
 * Collecte interactive des informations avec navigation
 * @returns {object|null} Infos du collegue, ou null si annule
 */
export async function collectInfo() {
  ui.section('Phase 1 — Informations de base');
  console.log(ui.muted('  Tape /retour pour revenir a la question precedente'));
  console.log(ui.muted('  Tape /annuler pour tout annuler'));
  console.log('');

  const steps = ['prenom', 'profil', 'personnalite'];
  let stepIndex = 0;
  const data = {};

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];

    if (step === 'prenom') {
      const val = await ask({
        type: 'input',
        name: 'prenom',
        message: 'Comment s\'appelle ce collegue ?',
        prefix: '  👤',
        validate: (v) => {
          const cmd = v.trim().toLowerCase();
          if (cmd.startsWith('/')) return true;
          return v.trim() ? true : 'Il faut au moins un prenom ou alias';
        },
      });

      if (val === CANCEL) { ui.info('Annule.'); return null; }
      if (val === BACK) { ui.info('C\'est deja la premiere question.'); continue; }

      data.prenom = val;
      data.slug = toSlug(val);
      ui.info(`Slug : ${ui.accent(data.slug)}`);
      ui.blank();
      stepIndex++;

    } else if (step === 'profil') {
      const val = await ask({
        type: 'input',
        name: 'profil',
        message: 'Son profil en une phrase (entreprise, poste, niveau, genre) :',
        prefix: '  🏢',
      });

      if (val === CANCEL) { ui.info('Annule.'); return null; }
      if (val === BACK) { stepIndex--; continue; }

      Object.assign(data, parseProfil(val || ''));
      ui.blank();
      stepIndex++;

    } else if (step === 'personnalite') {
      const val = await ask({
        type: 'input',
        name: 'personnalite',
        message: 'Sa personnalite (MBTI, traits, style, impression) :',
        prefix: '  🧠',
      });

      if (val === CANCEL) { ui.info('Annule.'); return null; }
      if (val === BACK) { stepIndex--; continue; }

      Object.assign(data, parsePersonnalite(val || ''));
      ui.blank();
      stepIndex++;
    }
  }

  // Recapitulatif avec possibilite de modifier
  let confirmed = false;

  while (!confirmed) {
    ui.section('Recapitulatif');

    const recap = [
      ['Prenom', `${data.prenom} (/${data.slug})`],
    ];
    if (data.poste) recap.push(['Poste', `${data.poste}${data.entreprise ? ` chez ${data.entreprise}` : ''}`]);
    if (data.niveau) recap.push(['Niveau', data.niveau]);
    if (data.genre) recap.push(['Genre', data.genre]);
    if (data.mbti) recap.push(['MBTI', data.mbti]);
    if (data.tags?.length) recap.push(['Personnalite', data.tags.join(', ')]);
    if (data.tagsCulture?.length) recap.push(['Culture', data.tagsCulture.join(', ')]);
    if (data.impression) recap.push(['Impression', `"${data.impression}"`]);

    ui.table(recap);
    ui.blank();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Que faire ?',
      prefix: '  ✅',
      choices: [
        { name: '✓  Confirmer et continuer', value: 'confirm' },
        { name: '✏️  Modifier le prenom', value: 'edit_prenom' },
        { name: '✏️  Modifier le profil pro', value: 'edit_profil' },
        { name: '✏️  Modifier la personnalite', value: 'edit_perso' },
        { name: '✗  Annuler', value: 'cancel' },
      ],
    }]);

    if (action === 'confirm') {
      confirmed = true;
    } else if (action === 'cancel') {
      ui.info('Annule.');
      return null;
    } else if (action === 'edit_prenom') {
      const { val } = await inquirer.prompt([{
        type: 'input',
        name: 'val',
        message: 'Nouveau prenom :',
        prefix: '  👤',
        default: data.prenom,
      }]);
      data.prenom = val.trim();
      data.slug = toSlug(data.prenom);
    } else if (action === 'edit_profil') {
      const { val } = await inquirer.prompt([{
        type: 'input',
        name: 'val',
        message: 'Nouveau profil :',
        prefix: '  🏢',
      }]);
      const parsed = parseProfil(val || '');
      if (parsed.poste) data.poste = parsed.poste;
      if (parsed.entreprise) data.entreprise = parsed.entreprise;
      if (parsed.niveau) data.niveau = parsed.niveau;
      if (parsed.genre) data.genre = parsed.genre;
    } else if (action === 'edit_perso') {
      const { val } = await inquirer.prompt([{
        type: 'input',
        name: 'val',
        message: 'Nouvelle personnalite :',
        prefix: '  🧠',
      }]);
      const parsed = parsePersonnalite(val || '');
      if (parsed.mbti) data.mbti = parsed.mbti;
      if (parsed.tags?.length) data.tags = parsed.tags;
      if (parsed.tagsCulture?.length) data.tagsCulture = parsed.tagsCulture;
      if (parsed.impression) data.impression = parsed.impression;
    }
  }

  return data;
}

/**
 * Parse le profil professionnel
 */
function parseProfil(text) {
  if (!text.trim()) return {};
  const result = {};

  const genreMatch = text.match(/\b(homme|femme|non[- ]binaire)\b/i);
  if (genreMatch) result.genre = genreMatch[1].toLowerCase();

  const entrepriseMatch = text.match(/(?:chez|@|a |à )\s*([A-Z][\w\s&.'-]+?)(?:\s*[,.]|\s+\d|\s+niveau|\s+senior|\s+junior|\s+lead|\s+manager|$)/i);
  if (entrepriseMatch) result.entreprise = entrepriseMatch[1].trim();

  const niveaux = ['junior', 'confirme', 'confirmee', 'senior', 'lead', 'expert', 'experte', 'manager', 'directeur', 'directrice', 'vp', 'principal', 'staff'];
  const niveauMatch = text.toLowerCase().match(new RegExp(`\\b(${niveaux.join('|')})\\b`, 'i'));
  if (niveauMatch) result.niveau = niveauMatch[1];

  const postes = [
    'developpeur', 'developpeuse', 'dev', 'developer',
    'product manager', 'pm', 'product owner', 'po',
    'designer', 'ux', 'ui',
    'data analyst', 'data scientist', 'data engineer',
    'devops', 'sre', 'admin sys',
    'tech lead', 'cto', 'architecte',
    'scrum master', 'coach agile',
    'qa', 'testeur', 'testeuse',
    'frontend', 'backend', 'fullstack', 'full-stack',
    'chef de projet', 'project manager',
    'analyste', 'consultant', 'consultante',
    'ingenieur', 'ingenieure', 'engineer',
  ];
  for (const poste of postes) {
    if (text.toLowerCase().includes(poste)) {
      const regex = new RegExp(`((?:\\w+\\s+)?${poste}(?:\\s+\\w+)?)`, 'i');
      const match = text.match(regex);
      if (match) { result.poste = match[1].trim(); break; }
    }
  }

  return result;
}

/**
 * Parse la personnalite
 */
function parsePersonnalite(text) {
  if (!text.trim()) return {};
  const result = { tags: [], tagsCulture: [], impression: '' };

  const mbtiMatch = text.match(/\b(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)\b/i);
  if (mbtiMatch) result.mbti = mbtiMatch[1].toUpperCase();

  const knownTags = [
    'perfectionniste', 'procrastinateur', 'procrastinatrice', 'workaholic',
    'tire-au-flanc', 'fayot', 'fayote', 'bonne-poire', 'bonne poire',
    'direct', 'directe', 'laconique', 'bavard', 'bavarde',
    'tergiversateur', 'tergiversatrice', 'passif-agressif', 'passive-agressive',
    'politique', 'mentor', 'solitaire', 'team player',
    'data-driven', 'data driven',
  ];
  knownTags.forEach(tag => {
    if (text.toLowerCase().includes(tag)) result.tags.push(tag);
  });

  const cultureTags = {
    'startup': 'style startup', 'grand groupe': 'style grand groupe',
    'conseil': 'style conseil', 'public': 'style public',
    'administration': 'style public', 'agile': 'style agile',
    'craft': 'style craft', 'entrepreneur': 'style entrepreneur',
  };
  Object.entries(cultureTags).forEach(([keyword, tag]) => {
    if (text.toLowerCase().includes(keyword)) result.tagsCulture.push(tag);
  });

  let impression = text;
  if (result.mbti) impression = impression.replace(new RegExp(result.mbti, 'gi'), '');
  result.tags.forEach(tag => { impression = impression.replace(new RegExp(tag, 'gi'), ''); });
  impression = impression.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  if (impression) result.impression = impression;

  return result;
}
