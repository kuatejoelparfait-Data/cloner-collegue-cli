/**
 * Commande : /chat <slug>
 * Mode conversation avec un clone
 * /retour pour quitter la conversation et revenir au shell
 */

import inquirer from 'inquirer';
import { createProvider } from '../providers/index.js';
import { loadClone, cloneExists, listClones, saveChatHistory, loadChatHistory, deleteChatHistory } from '../storage/index.js';
import { PROMPTS } from '../prompts/system.js';
import { getConfig } from '../utils/config.js';
import { ui } from '../utils/ui.js';
import { loadEnv } from '../utils/env.js';

export async function chatCommand(slug, options = {}) {
  loadEnv();

  if (!cloneExists(slug)) {
    ui.fail(`Clone "/${slug}" introuvable. Lance "cloner liste" pour voir les clones.`);
    return;
  }

  const clone = loadClone(slug);
  const config = getConfig();

  // Choix du mode — avec possibilite de retour
  let cloneContent;
  if (options.metier) {
    cloneContent = clone.work;
  } else if (options.comportement) {
    cloneContent = clone.persona;
  } else {
    const { mode } = await inquirer.prompt([{
      type: 'list',
      name: 'mode',
      message: `Mode de conversation avec ${clone.meta?.prenom || slug} :`,
      prefix: '  💬',
      choices: [
        { name: 'Clone complet (metier + comportement)', value: 'full' },
        { name: 'Profil metier uniquement', value: 'metier' },
        { name: 'Empreinte comportementale uniquement', value: 'comportement' },
        new inquirer.Separator(),
        { name: '↩️  Retour', value: 'back' },
      ],
    }]);

    if (mode === 'back') return;

    if (mode === 'metier') {
      cloneContent = clone.work;
    } else if (mode === 'comportement') {
      cloneContent = clone.persona;
    } else {
      cloneContent = clone.combined || `${clone.work || ''}\n\n---\n\n${clone.persona || ''}`;
    }
  }

  // Creer le provider
  const providerName = options.provider || config.defaultProvider || 'claude';
  const provider = createProvider(providerName, {
    model: options.model || config.providers?.[providerName]?.model,
  });

  const systemPrompt = PROMPTS.chatMode(cloneContent);
  const messages = loadChatHistory(slug);
  const prenom = clone.meta?.prenom || slug;

  ui.section(`Conversation avec ${prenom}`);
  ui.info(`Via ${provider.name} (${provider.model || provider.defaultModel})`);
  if (messages.length > 0) {
    ui.info(`💬 ${messages.length} messages precedents charges. /reset pour repartir de zero.`);
  }
  console.log(ui.muted('  /retour ou /quit pour quitter, /reset pour vider l\'historique, /historique pour revoir\n'));

  // Boucle de conversation
  while (true) {
    const { userInput } = await inquirer.prompt([{
      type: 'input',
      name: 'userInput',
      message: `toi >`,
      prefix: '  ',
    }]);

    const input = userInput.trim();
    if (!input) continue;

    // Commandes speciales dans le chat
    const cmd = input.toLowerCase();
    if (['/quit', '/quitter', '/q', '/exit', '/retour', '/back', '/r'].includes(cmd)) {
      ui.info('Fin de la conversation.');
      return;
    }

    if (['/reset', '/clear', '/nouveau'].includes(cmd)) {
      messages.length = 0;
      deleteChatHistory(slug);
      ui.ok('Historique vide. Nouvelle conversation.');
      continue;
    }

    if (['/mode', '/changer'].includes(cmd)) {
      ui.info('Quitte le chat et relance /chat pour changer de mode.');
      continue;
    }

    if (cmd === '/aide' || cmd === '/help') {
      ui.info('Commandes dans le chat :');
      ui.info('  /retour      revenir au menu principal');
      ui.info('  /reset       vider l\'historique de conversation');
      ui.info('  /historique  voir les 5 derniers echanges');
      ui.info('  /aide        afficher cette aide');
      continue;
    }

    if (['/historique', '/history', '/hist'].includes(cmd)) {
      if (messages.length === 0) {
        ui.info('Aucun historique de conversation.');
      } else {
        ui.section('Derniers echanges');
        // Prendre les 10 derniers messages (5 paires user/assistant)
        const recent = messages.slice(-10);
        for (const msg of recent) {
          if (msg.role === 'user') {
            console.log(`  ${ui.muted('toi >')} ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
          } else {
            console.log(`  ${ui.accent(prenom)} : ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
          }
        }
        console.log('');
      }
      continue;
    }

    messages.push({ role: 'user', content: input });

    const spinner = ui.spinner('');
    spinner.start();

    try {
      const response = await provider.chat(systemPrompt, messages, { maxTokens: 2048 });
      spinner.stop();

      messages.push({ role: 'assistant', content: response });
      saveChatHistory(slug, messages);

      console.log(`  ${ui.accent(prenom)} : ${response}`);
      console.log('');
    } catch (error) {
      spinner.fail('Erreur');
      ui.fail(error.message);

      // Retirer le message qui a cause l'erreur
      messages.pop();
    }
  }
}
