# LapagKainan — "Ilaw" design system

**Idea.** At night, from above, you can tell where people eat by where the lights are on.
Every discovery is a light on a warm charcoal map. Community activity is what makes a place glow.

## Rules
1. **Everything is square except light.** Circles are reserved for things that are *lights*: map markers, clusters, the locate button, avatars. Photos, buttons, pages, inputs are sharp (0 radius). Dialog slabs are square too.
2. **People speak in condensed type; facts speak in mono.** Quotes/headlines: Archivo condensed. Price, distance, time, usernames, labels: IBM Plex Mono, uppercase.
3. **One accent: ember** (`#ff7a3d`). It means *light* (markers, glow) and *action* (LAPAG). Leaf green appears only for verified visits.
4. **No containers by default.** Hairlines and spacing separate things. A surface (`--night2`) appears only when something floats over the map or the page needs a layer.
5. **Photos keep their shape** on detail pages (natural aspect ratio). Feeds crop deliberately and vary ratios.

## Light language (map)
| State | Treatment |
|---|---|
| Zoomed out | Ember dots with glow; overlapping spots merge into a glowing cluster with a mono count |
| Street level | Circular food photo with cream ring + amber glow |
| Verified visits | Ember ring instead of cream |
| New (< 7 days) | Slow pulse ring |
| Inactive (reported closed) | Light off: greyscale, no glow |
| Selected | Bigger light + an editorial annotation drawn on the map (leader line, name, the discoverer's words) |

## Tokens
- Colours: `--night #13110f` · `--night2 #1c1916` · `--night3 #28231f` · `--cream #f2e8d8` · `--cream2 #bfb3a2` · `--cream3 #857a6d` · `--ember #ff7a3d` · `--ember-hi #ffb46b` · `--leaf #a3c96f`
- Type: Archivo (variable width 62–125). Display `font-stretch: 72%` 800 · Say (quotes) 72% 650 · UI 100% 400–600 · Wordmark 125% 900. Mono: IBM Plex Mono 400/500, 11–12px uppercase.
- Scale: 11 · 13 · 15 · 20 · 28 · 44.
- Spacing: 4 · 8 · 12 · 16 · 24 · 40.
- Radius: 0 everywhere · 50% for lights.
- Elevation: none. Glow (`--glow`) is the only "shadow", and it only exists on lights.

## Interaction
- Mobile: map fills the screen. A tray of photo stories sits at the bottom; swiping it flies the camera to that light. Tap the focused light (or the story) to open the discovery page.
- Desktop: full-viewport map; stories float as a column on the left with the map visible between them; the discovery page opens as a right-hand layer.
- Search is a sentence ("Saan tayo kakain?") that opens a full-screen typographic search, not a pill.
- Motion: pages slide 220 ms; annotations draw in; new lights pulse; like = small burst. Nothing else animates.
