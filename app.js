// Pizca: a recipe list, a blog-style recipe page, and a full-screen cook mode
// you tap through like a story. Recipes are JSON files in recipes/, listed in
// recipes/index.json. Routes: #/ (list), #/<slug> (recipe), #/<slug>/cook/<n>.
'use strict';

const app = document.getElementById('app');
const story = document.getElementById('story');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const minutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

function clock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const timerLength = (sec) => (sec % 60 === 0 ? minutes(sec / 60) : sec < 60 ? `${sec} s` : clock(sec));

/* Data */

let recipes = null; // slug -> recipe, in index order

async function loadRecipes() {
  if (recipes) return recipes;
  const slugs = await (await fetch('recipes/index.json')).json();
  const list = await Promise.all(slugs.map((s) => fetch(`recipes/${s}.json`).then((r) => r.json())));
  recipes = new Map(list.map((r) => [r.slug, r]));
  return recipes;
}

/** The story slides for a recipe: what to get out, each mise task, each step, then serve. */
function slidesFor(r) {
  const slides = [{ kind: 'start', title: r.title }];
  r.mise.forEach((m, i) => slides.push({ ...m, kind: 'mise', label: `Mise en place · ${i + 1} of ${r.mise.length}` }));
  r.steps.forEach((s, i) => slides.push({ ...s, kind: 'step', label: `Step ${i + 1} of ${r.steps.length}` }));
  slides.push({ kind: 'end', title: 'Done. Eat.' });
  return slides;
}

/* Pages */

function renderList(all) {
  document.title = 'Pizca';
  app.innerHTML = `<ul class="cards">${[...all.values()]
    .map(
      (r) => `<li class="card"><a href="#/${esc(r.slug)}">
        <h2>${esc(r.title)}</h2>
        <p>${esc(r.summary)}</p>
        <div class="meta"><span>Serves <b>${r.servings}</b></span><span><b>${minutes(r.time.total)}</b> total</span></div>
      </a></li>`,
    )
    .join('')}</ul>`;
}

function renderRecipe(r) {
  document.title = `${r.title} · Pizca`;
  const timed = (t) => (t ? `<span class="pill">⏱ ${esc(t.label)} · ${timerLength(t.seconds)}</span>` : '');
  const task = (x) => `<li><strong>${esc(x.title)}</strong><p>${esc(x.text)}</p>
    ${x.tip ? `<p class="tip">${esc(x.tip)}</p>` : ''}${timed(x.timer)}</li>`;
  app.innerHTML = `<article class="recipe">
    <a class="back" href="#/">← All recipes</a>
    <h1>${esc(r.title)}</h1>
    <p class="summary">${esc(r.summary)}</p>
    <dl class="facts">
      <div><dt>Serves</dt><dd>${r.servings}</dd></div>
      <div><dt>Prep</dt><dd>${minutes(r.time.prep)}</dd></div>
      <div><dt>Cook</dt><dd>${minutes(r.time.cook)}</dd></div>
      <div><dt>Total</dt><dd>${minutes(r.time.total)}</dd></div>
    </dl>
    <button type="button" class="cook-btn" id="cook">Start cooking <small>step by step, with timers</small></button>

    <h2>Ingredients</h2>
    ${r.ingredients
      .map(
        (g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ''}<ul class="ingredients">${g.items
          .map(
            (i) => `<li><span class="qty">${esc(i.qty ?? '')}</span>
              <span>${esc(i.item)}${i.note ? `<span class="note">, ${esc(i.note)}</span>` : ''}</span></li>`,
          )
          .join('')}</ul>`,
      )
      .join('')}

    <h2>Equipment</h2>
    <ul class="plain">${r.equipment.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>

    <h2>Mise en place</h2>
    <ol class="method mise">${r.mise.map(task).join('')}</ol>

    <h2>Method</h2>
    <ol class="method">${r.steps.map(task).join('')}</ol>

    ${r.notes?.length ? `<h2>Notes</h2><ul class="plain">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

    <h2>Cook log</h2>
    ${r.log?.length
      ? `<ul class="log">${r.log
          .map((l) => `<li><time datetime="${esc(l.date)}">${esc(l.date)}</time>${esc(l.note)}</li>`)
          .join('')}</ul>`
      : '<p class="empty">Not cooked yet.</p>'}
  </article>`;
  document.getElementById('cook').addEventListener('click', () => go(`#/${r.slug}/cook/0`));
}

/* Timers: keyed by slide index, counted from wall-clock end times so they stay
   accurate when the tab is in the background. They keep running across slides. */

const timers = new Map(); // index -> { label, total, end, left, paused, done }
let tick = null;
let audio = null;

function timerLeft(t) {
  return t.paused || t.done ? t.left : (t.end - Date.now()) / 1000;
}

function startTimer(i, slide) {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume?.();
  timers.set(i, { label: slide.timer.label, total: slide.timer.seconds, end: Date.now() + slide.timer.seconds * 1000, left: slide.timer.seconds, paused: false, done: false });
  ensureTick();
}

function toggleTimer(i) {
  const t = timers.get(i);
  if (!t || t.done) return;
  if (t.paused) {
    t.end = Date.now() + t.left * 1000;
    t.paused = false;
  } else {
    t.left = timerLeft(t);
    t.paused = true;
  }
  ensureTick();
}

function ensureTick() {
  if (!tick) tick = setInterval(onTick, 250);
  onTick();
}

function onTick() {
  let live = false;
  for (const t of timers.values()) {
    if (!t.paused && !t.done && timerLeft(t) <= 0) {
      t.done = true;
      t.left = 0;
      ring();
    }
    live ||= !t.paused && !t.done;
  }
  if (!live && tick) {
    clearInterval(tick);
    tick = null;
  }
  drawTimers();
}

function ring() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (!audio) return;
  const now = audio.currentTime;
  for (let k = 0; k < 3; k++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, now + k * 0.45);
    g.gain.exponentialRampToValueAtTime(0.4, now + k * 0.45 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + k * 0.45 + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(now + k * 0.45);
    o.stop(now + k * 0.45 + 0.4);
  }
}

/* Cook mode */

let cook = null; // { recipe, slides, index }
let wake = null;

async function keepAwake() {
  try {
    wake = await navigator.wakeLock?.request('screen');
  } catch {
    // Not supported or refused; cooking works without it.
  }
}

document.addEventListener('visibilitychange', () => {
  if (cook && document.visibilityState === 'visible') keepAwake();
});

function openCook(r, index) {
  if (!cook || cook.recipe !== r) {
    timers.clear();
    cook = { recipe: r, slides: slidesFor(r), index: 0 };
    keepAwake();
  }
  cook.index = Math.min(Math.max(index, 0), cook.slides.length - 1);
  story.hidden = false;
  document.body.style.overflow = 'hidden';
  drawSlide();
}

function closeCook() {
  story.hidden = true;
  document.body.style.overflow = '';
  wake?.release?.();
  wake = null;
}

function step(delta) {
  if (!cook) return;
  const next = cook.index + delta;
  if (next < 0 || next >= cook.slides.length) return;
  history.replaceState(null, '', `#/${cook.recipe.slug}/cook/${next}`);
  cook.index = next;
  drawSlide();
}

function drawSlide() {
  const { recipe: r, slides, index } = cook;
  const s = slides[index];
  let body;
  if (s.kind === 'start') {
    body = `<div class="kicker">Before you start</div>
      <h2>${esc(r.title)}</h2>
      <p>Serves ${r.servings} · about ${minutes(r.time.total)}. Get these out first:</p>
      <ul>${r.equipment.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      <p class="tip">${r.mise.length} prep tasks, then ${r.steps.length} steps. Tap the right side to go on.</p>`;
  } else if (s.kind === 'end') {
    body = `<div class="kicker">Finished</div><h2>${esc(s.title)}</h2>
      <p>That’s ${esc(r.title)}. If you changed anything, add it to the cook log.</p>`;
  } else {
    body = `<div class="kicker">${esc(s.label)}</div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.text)}</p>
      ${s.tip ? `<p class="tip">${esc(s.tip)}</p>` : ''}
      ${s.timer ? `<button type="button" class="timer-btn" data-timer="${index}"></button>` : ''}`;
  }
  story.innerHTML = `
    <div class="bars" aria-hidden="true">${slides.map((_, i) => `<span class="${i <= index ? 'on' : ''}"></span>`).join('')}</div>
    <div class="story-top">
      <span class="story-title-small">${esc(r.title)}</span>
      <button type="button" class="icon-btn" data-close aria-label="Close cook mode">✕</button>
    </div>
    <section class="slide" aria-live="polite">${body}</section>
    <div class="tray" aria-label="Running timers"></div>
    <div class="story-nav">
      <button type="button" data-prev ${index === 0 ? 'disabled' : ''}>Back</button>
      ${index === slides.length - 1
        ? '<button type="button" class="next" data-close>Close</button>'
        : '<button type="button" class="next" data-next>Next</button>'}
    </div>
    <p class="hint">Tap left or right, swipe, or use the arrow keys.</p>`;
  drawTimers();
}

function drawTimers() {
  if (!cook || story.hidden) return;
  const btn = story.querySelector('[data-timer]');
  if (btn) {
    const i = Number(btn.dataset.timer);
    const t = timers.get(i);
    const s = cook.slides[i];
    btn.className = `timer-btn${t ? (t.done ? ' done' : t.paused ? '' : ' running') : ''}`;
    btn.textContent = !t
      ? `▶ Start ${timerLength(s.timer.seconds)} timer`
      : t.done
        ? `✓ ${s.timer.label} done · restart`
        : `${t.paused ? '▶' : '❚❚'} ${clock(timerLeft(t))}`;
  }
  const tray = story.querySelector('.tray');
  tray.innerHTML = [...timers.entries()]
    .filter(([i]) => i !== cook.index)
    .map(
      ([i, t]) => `<span class="chip${t.done ? ' done' : t.paused ? ' paused' : ''}">
        <button type="button" class="go" data-goto="${i}">${esc(t.label)} ${t.done ? 'done' : clock(timerLeft(t))}</button>
        <button type="button" data-dismiss="${i}" aria-label="${t.done ? 'Dismiss' : 'Cancel'} ${esc(t.label)} timer">✕</button>
      </span>`,
    )
    .join('');
}

story.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (el) {
    if (el.matches('[data-close]')) return go(`#/${cook.recipe.slug}`);
    if (el.matches('[data-next]')) return step(1);
    if (el.matches('[data-prev]')) return step(-1);
    if (el.matches('[data-timer]')) {
      const i = Number(el.dataset.timer);
      const t = timers.get(i);
      return !t || t.done ? startTimer(i, cook.slides[i]) : toggleTimer(i);
    }
    if (el.matches('[data-goto]')) return step(Number(el.dataset.goto) - cook.index);
    if (el.matches('[data-dismiss]')) {
      timers.delete(Number(el.dataset.dismiss));
      return drawTimers();
    }
    return;
  }
  // A tap anywhere else: left third goes back, the rest goes forward.
  step(e.clientX < window.innerWidth / 3 ? -1 : 1);
});

let touchX = null;
story.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
story.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) {
    e.preventDefault(); // a swipe, not a tap
    step(dx < 0 ? 1 : -1);
  }
});

document.addEventListener('keydown', (e) => {
  if (story.hidden) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Escape') go(`#/${cook.recipe.slug}`);
});

/* Routing */

function go(hash) {
  location.hash = hash;
}

async function route() {
  const [slug, mode, n] = location.hash.replace(/^#\/?/, '').split('/');
  let all;
  try {
    all = await loadRecipes();
  } catch {
    app.innerHTML = '<p class="empty">Couldn’t load the recipes.</p>';
    return;
  }
  const r = slug && all.get(slug);
  if (!r) {
    closeCook();
    return renderList(all);
  }
  if (!app.querySelector('.recipe') || document.title !== `${r.title} · Pizca`) renderRecipe(r);
  if (mode === 'cook') openCook(r, Number(n) || 0);
  else closeCook();
}

window.addEventListener('hashchange', route);
route();
