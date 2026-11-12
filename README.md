# Pizca

The recipes I've been cooking, each written out in full, down to the mise en place.

**Live:** https://francisphan.github.io/pizca/

Every recipe has two views:

- **The recipe page.** A standard recipe-blog layout: servings and times, ingredients, equipment, the mise en place, the method, notes, and a cook log.
- **Cook mode.** "Start cooking" opens a full-screen view you tap through like a story: what to get out, then one slide per prep task, then one per step.
  - Tap the right side to go forward and the left to go back. Swiping and the arrow keys also work.
  - A step with a time gets a timer button. Timers keep running while you move between slides, so overlapping steps work, and you can tap a running timer to jump back to its step.
  - When a timer finishes it chimes and vibrates. The screen stays awake while cook mode is open.

It's a plain static site with no build step: `index.html`, `app.js` and `style.css`, with the recipes as JSON in `recipes/`.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
node scripts/check.mjs        # validate every recipe (CI runs this before deploying)
```

## Adding a recipe

1. Save it as `recipes/<slug>.json` in the format below.
2. Add the slug to `recipes/index.json`. The list page follows that order.
3. Run `node scripts/check.mjs`, then commit and push. GitHub Pages deploys from `main`.

### Recipe format

```jsonc
{
  "slug": "carbonara",                 // must match the file name
  "title": "Spaghetti alla Carbonara",
  "summary": "One or two sentences for the list and the top of the page.",
  "servings": 4,
  "time": { "prep": 15, "cook": 20, "total": 35 },   // minutes
  "tags": ["pasta", "weeknight"],      // optional
  "equipment": ["Large pot with a lid", "12-inch skillet"],
  "ingredients": [
    {
      "group": "Sauce",                // optional heading
      "items": [
        { "qty": "150 g", "item": "guanciale", "note": "cut into 1 cm batons" }   // qty and note optional
      ]
    }
  ],
  "mise": [                            // prep before cooking: one task per slide in cook mode
    {
      "title": "Grate the cheese",
      "text": "Finely grate 80 g Pecorino Romano…",   // full sentences with quantities, readable on their own
      "tip": "Optional aside.",
      "timer": { "label": "Water to boil", "seconds": 600 }   // optional
    }
  ],
  "steps": [ /* same shape as mise */ ],
  "notes": ["Optional notes."],
  "log": [ { "date": "2026-11-12", "note": "How it went, what to change." } ]
}
```

Write each mise task and step so it makes sense on its own, quantities included. In cook mode you only see one at a time.

### Asking Claude for a recipe in this format

> Write this recipe as Pizca JSON (format in the README of github.com/francisphan/pizca). Include equipment, a full mise en place with every ingredient measured and prepped, and timers on any timed task or step.
