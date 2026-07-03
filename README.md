# Chasing Flow — chasingflow.ch

Production static site for **Chasing Flow**, a Swiss iOS app studio (HuntMate · Lake Zürich).
One continuous scroll-driven journey into flow: morning meadows → alpine peaks → golden hour →
across the waterline → into turquoise water → pure golden light ("Eden").

Built per the approved design in [`design_handoff_chasing_flow/`](design_handoff_chasing_flow/README.md).

## Stack

Plain HTML + CSS + vanilla JS. No frameworks, no animation libraries, no build step.
The whole scene is one dependency-free `<canvas>` 2D render loop.

| File | Purpose |
| --- | --- |
| `index.html` | The landing page (all copy, placeholder slots, HUD markup) |
| `styles.css` | Design tokens, page + legal-page styles, keyframes |
| `main.js` | Canvas scene, flow-meter HUD, pointer ripples/swirl, reveal-on-scroll |
| `impressum.html` / `privacy.html` | Minimal Swiss legal pages in the same style |

## Run locally

Any static server from the repo root, e.g.:

```sh
python3 -m http.server 4173
# → http://localhost:4173
```

(Opening `index.html` directly from disk works too — fonts load from Google Fonts.)

## Behavior notes

- **Scroll-driven everything, native scrolling only.** The `#waterMark` element's document Y
  is the water surface's world position; the canvas derives the whole crossing from it —
  keep that coupling if you edit the page structure.
- **Fixed HUD** top-right ticks `FLOW 0% → 100%` with a zone label; uses
  `mix-blend-mode: difference` to stay legible over sky and water. Hitting 100% fires a
  one-time golden bloom burst.
- **`prefers-reduced-motion: reduce`**: time is frozen, ambient life (birds, fish, grass,
  particles, droplets, ripples, bloom) and CSS animations are off, reveals are skipped;
  scroll-driven color/position ramps remain.
- **No-JS fallback**: all content is normal-flow HTML on the flat morning-blue background.
- **Performance**: one rAF loop, DPR capped at 2, canvas resized only on viewport change,
  DOM writes only on value change, capped entity counts. Targets 60fps on mid-range phones.

## Deployment

Pushed to `main` → deployed to **GitHub Pages** by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
(only the site files are published; repo docs and tooling are excluded from the artifact).
Custom domain: **www.chasingflow.ch** (primary; the apex `chasingflow.ch` redirects to it —
GitHub's recommended setup). DNS at Hostpoint:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `martinotschudi.github.io` |

After DNS propagates, enable **Enforce HTTPS** in the repo's Pages settings
(GitHub provisions the certificate automatically once the domain resolves).

## Open items (client)

Marked with `TODO(client)` in the HTML and amber `[placeholder]` chips on the legal pages:

1. App Store URLs for both pills (then add `target="_blank" rel="noopener"`).
2. Real app icons + screenshots for the striped placeholder slots.
3. Impressum: street + postal code/town still missing.
4. Privacy: link the app privacy policies once the App Store pages exist.
5. OG image + Smart App Banner metas (`apple-itunes-app`) once App IDs exist.
6. Contact email is `marti.tschudi@gmail.com` for now — swap to a chasingflow.ch
   mailbox later if one is created (index, impressum, privacy).
