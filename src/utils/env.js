/**
 * Charge les variables d'environnement depuis .env
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env') });
}
