// Fails if anything under engine/ imports game code: the engine must stay reusable.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const engineDir = join(root, 'engine');
const gameDir = join(root, 'game');
const importRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const violations = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|js)$/.test(name)) check(path);
  }
};
const check = (file) => {
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(importRe)) {
    const target = spec.startsWith('.') ? resolve(file, '..', spec) : spec;
    if (target.startsWith(gameDir) || spec.startsWith('@voxel/game')) {
      violations.push(`${relative(root, file)} -> ${spec}`);
    }
  }
};

walk(engineDir);
if (violations.length > 0) {
  console.error('engine/ must not import game code:\n  ' + violations.join('\n  '));
  process.exit(1);
}
console.log('engine boundary OK');
