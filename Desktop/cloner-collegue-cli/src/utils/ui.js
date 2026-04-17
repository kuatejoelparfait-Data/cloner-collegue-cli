/**
 * Utilitaires d'interface terminal
 */

import chalk from 'chalk';
import ora from 'ora';

export const ui = {
  // Couleurs du theme
  accent: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  bold: chalk.white.bold,

  /**
   * Affiche le header d'une section
   */
  section(title) {
    console.log('');
    console.log(chalk.cyan.bold(`  ── ${title} ──`));
    console.log('');
  },

  /**
   * Affiche un message de succes
   */
  ok(message) {
    console.log(chalk.green(`  ✓ ${message}`));
  },

  /**
   * Affiche un avertissement
   */
  warn(message) {
    console.log(chalk.yellow(`  ⚠ ${message}`));
  },

  /**
   * Affiche une erreur
   */
  fail(message) {
    console.log(chalk.red(`  ✗ ${message}`));
  },

  /**
   * Affiche une info
   */
  info(message) {
    console.log(chalk.gray(`  ℹ ${message}`));
  },

  /**
   * Affiche une ligne vide
   */
  blank() {
    console.log('');
  },

  /**
   * Cree un spinner
   */
  spinner(text) {
    return ora({
      text,
      color: 'cyan',
      spinner: 'dots',
      indent: 2,
    });
  },

  /**
   * Affiche un bloc de texte indente
   */
  block(text) {
    const lines = text.split('\n');
    lines.forEach(line => console.log(`    ${line}`));
  },

  /**
   * Affiche un tableau simple
   */
  table(rows) {
    const maxKey = Math.max(...rows.map(([k]) => k.length));
    rows.forEach(([key, value]) => {
      console.log(`  ${chalk.cyan(key.padEnd(maxKey + 2))} ${value}`);
    });
  },

  /**
   * Affiche un encadre
   */
  box(title, lines) {
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const border = '─'.repeat(maxLen + 4);
    console.log(chalk.cyan(`  ┌${border}┐`));
    console.log(chalk.cyan(`  │  ${chalk.white.bold(title.padEnd(maxLen))}  │`));
    console.log(chalk.cyan(`  ├${border}┤`));
    lines.forEach(line => {
      console.log(chalk.cyan(`  │  ${chalk.white(line.padEnd(maxLen))}  │`));
    });
    console.log(chalk.cyan(`  └${border}┘`));
  },
};
