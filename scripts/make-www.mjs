// Stages the game's static files into www/ — the folder Capacitor copies
// into the native iOS project. Run via `npm run www` (or any ios:* script).
import { rmSync, mkdirSync, cpSync } from 'node:fs';

const ITEMS = [
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'sw.js',
  'js',
  'icons',
];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const item of ITEMS) {
  cpSync(item, `www/${item}`, { recursive: true });
}
console.log(`www/ staged (${ITEMS.length} entries)`);
