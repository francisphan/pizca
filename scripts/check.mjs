// Validates every recipe in recipes/ against the format in README.md.
// Run: node scripts/check.mjs   (exits non-zero and lists problems if any)
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../recipes/', import.meta.url);
const problems = [];
const say = (file, msg) => problems.push(`${file}: ${msg}`);

const index = JSON.parse(readFileSync(new URL('index.json', dir)));
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');

for (const slug of index) if (!files.includes(`${slug}.json`)) say('index.json', `lists "${slug}" but recipes/${slug}.json is missing`);
for (const f of files) if (!index.includes(f.slice(0, -5))) say('index.json', `doesn't list ${f}`);

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const num = (v) => Number.isFinite(v) && v > 0;

function task(file, where, t) {
  if (!str(t.title)) say(file, `${where} needs a title`);
  if (!str(t.text)) say(file, `${where} needs text`);
  if (t.tip !== undefined && !str(t.tip)) say(file, `${where} has an empty tip`);
  if (t.timer !== undefined) {
    if (!str(t.timer.label)) say(file, `${where} timer needs a label`);
    if (!Number.isInteger(t.timer.seconds) || t.timer.seconds <= 0) say(file, `${where} timer needs whole seconds > 0`);
  }
}

for (const f of files) {
  let r;
  try {
    r = JSON.parse(readFileSync(new URL(f, dir)));
  } catch (e) {
    say(f, `is not valid JSON (${e.message})`);
    continue;
  }
  if (r.slug !== f.slice(0, -5)) say(f, `slug "${r.slug}" should match the file name`);
  for (const k of ['title', 'summary']) if (!str(r[k])) say(f, `needs a ${k}`);
  if (!num(r.servings)) say(f, 'needs servings (a number)');
  for (const k of ['prep', 'cook', 'total']) if (!Number.isFinite(r.time?.[k])) say(f, `needs time.${k} in minutes`);
  if (!Array.isArray(r.equipment) || !r.equipment.every(str)) say(f, 'needs equipment (a list of strings)');
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) say(f, 'needs ingredient groups');
  else
    r.ingredients.forEach((g, i) => {
      if (!Array.isArray(g.items) || g.items.length === 0) say(f, `ingredient group ${i + 1} needs items`);
      else g.items.forEach((it, j) => !str(it.item) && say(f, `ingredient ${i + 1}.${j + 1} needs an item`));
    });
  for (const k of ['mise', 'steps']) {
    if (!Array.isArray(r[k]) || r[k].length === 0) say(f, `needs ${k}`);
    else r[k].forEach((t, i) => task(f, `${k} ${i + 1}`, t));
  }
  if (r.notes !== undefined && !(Array.isArray(r.notes) && r.notes.every(str))) say(f, 'notes should be a list of strings');
  if (r.log !== undefined) {
    if (!Array.isArray(r.log)) say(f, 'log should be a list');
    else r.log.forEach((l, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date ?? '')) say(f, `log ${i + 1} needs a YYYY-MM-DD date`);
      if (!str(l.note)) say(f, `log ${i + 1} needs a note`);
    });
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${files.length} recipe${files.length === 1 ? '' : 's'} ok`);
