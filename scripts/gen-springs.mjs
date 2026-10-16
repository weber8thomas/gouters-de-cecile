// Tire de design-system/motion.json des easings CSS linear() (générateur de ressort de Motion)
// et les écrit dans la famille « timing » de design-system/tokens.json :
//   gc-spring-<nom> (courbe) et gc-dur-spring-<nom> (durée réelle jusqu'au repos).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spring } from 'motion';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const motion = JSON.parse(readFileSync(join(root, 'design-system/motion.json'), 'utf8'));
const tokensPath = join(root, 'design-system/tokens.json');
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
const timing = tokens.timing.tokens.filter((t) => !t.name.startsWith('gc-spring-') && !t.name.startsWith('gc-dur-spring-'));

for (const [name, s] of Object.entries(motion.springs)) {
  const gen = spring({ keyframes: [0, 1], visualDuration: s.visualDuration, bounce: s.bounce });
  const pts = [];
  let t = 0, done = false;
  while (!done && t <= 5000) { const r = gen.next(t); pts.push(r.value); done = r.done; t += 16; }
  const ms = t - 16;
  const step = Math.max(1, Math.round(pts.length / 36));
  const samples = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((v) => +v.toFixed(3));
  timing.push({ name: `gc-spring-${name}`, value: `linear(${samples.join(', ')})`, usage: `${s.usage} Courbe CSS du ressort « ${name} » (à utiliser avec gc-dur-spring-${name}).` });
  timing.push({ name: `gc-dur-spring-${name}`, value: `${ms}ms`, usage: `Durée du ressort « ${name} » jusqu'au repos.` });
}
tokens.timing.tokens = timing;
writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + '\n');
console.log(`ressorts : ${Object.keys(motion.springs).join(', ')}`);
