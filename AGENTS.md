# Lex Corp Website — Agent / Developer Handoff

Read this before changing anything. It captures the architecture, the design
system, the decisions behind them, and the traps that already cost debugging
time once.

---

## 1. What this is

Marketing website for **Lex Corp Pvt. Ltd.**, a Nepal-based IT company
(cloud, DevOps, software, AI, cybersecurity, digital transformation).

It is a **sales asset**, not a portfolio. It gets shown in client meetings and
sales calls, so the visual bar is deliberately high: cinematic dark theme,
glassmorphism, live 3D infrastructure topology, animated terminal. The brief was
"make it look like a billion-dollar AI company" (reference points: Stripe,
Vercel, Linear, Cloudflare, NVIDIA, Awwwards winners).

**Do not "simplify" the visual design without being asked.** The motion and 3D
are the product here. Performance work is welcome; visual downgrades are not.

- **Owner / founder:** Laxman Chaudhary
- **Repo:** `github.com/lexcorp-cloud/website-astro` (remote already configured)
- **Local path:** `/Users/alex/github/lexcorp-cloud/website`
- **Production domain (intended):** `https://www.lexcorp.com.np`
- **Deploy target:** Vercel free tier (not yet connected — see §9)

---

## 2. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Astro 7** (`output: "static"`) | Ships zero JS by default; best SEO/perf ceiling for a content site. |
| Animation | **GSAP 3 + ScrollTrigger** | Timeline control and scroll batching. ~45KB gz, loads on every page. |
| 3D | **Three.js** | Hero topology only. Lazily imported — see §6. |
| Sitemap | `@astrojs/sitemap` | Auto-generates `sitemap-index.xml`. |
| Styling | Plain CSS + custom properties | No Tailwind. Global tokens in `src/styles/global.css`; page-specific rules in each `.astro` file's scoped `<style>`. |

There is **no React/Vue/Svelte**. If a task seems to need a framework component,
it almost certainly doesn't — prefer vanilla JS in an Astro `<script>`.

---

## 3. Commands

```bash
npm install
npm run dev      # or: npx astro dev --background
npm run build    # → dist/  (static, deployable anywhere)
npm run preview  # serves dist/ over HTTP — always test the build this way
```

Background dev server management: `astro dev stop | status | logs`.

**Never judge the build by opening `dist/index.html` as a `file://` URL.**
Astro emits root-absolute asset paths (`/_astro/…`) which only resolve over HTTP.
Opening the file directly renders an unstyled page and looks catastrophically
broken when nothing is actually wrong. Use `npm run preview`.

---

## 4. File map

```
src/
├── config/site.js           # Contact details, LinkedIn, env-backed keys. SINGLE SOURCE OF TRUTH.
├── data/services.js         # Services (8), technologies, why-us, process, stats.
├── layouts/BaseLayout.astro # <head>, SEO/OG/JSON-LD, theme bootstrap, header/footer, animation entry.
├── components/
│   ├── Header.astro         # Sticky glass nav, frosts on scroll, mobile drawer.
│   ├── Footer.astro         # 4-col footer + contact rows + status line.
│   ├── ThemeToggle.astro    # Dark ⇄ light, persisted to localStorage.
│   ├── HeroScene.astro      # <canvas> + lazy loader for the 3D scene.
│   ├── Terminal.astro       # Animated DevOps console. Fixed dark palette in BOTH themes.
│   ├── PipelineFlow.astro   # CSS-only CI/CD pipeline with travelling pulse.
│   └── Icon.astro           # ALL icons. One 24×24 grid, stroke 1.6. Add new icons here.
├── pages/
│   ├── index.astro          # Hero, stats, capabilities, ops/control-centre, process, why, CTA.
│   ├── services.astro       # 8 service cards with #slug anchors.
│   ├── about.astro          # Vision, mission, stats, process, why.
│   ├── contact.astro        # Contact rows + Web3Forms form + hCaptcha (see §6a).
│   └── tools/
│       └── email-security.astro  # SPF/DKIM/DMARC scanner (see §6b).
├── scripts/
│   ├── animations.js        # GSAP orchestration for every page. Loaded by BaseLayout.
│   └── hero-scene.js        # Three.js scene. Lazily imported by HeroScene.astro only.
├── styles/global.css        # Design tokens + all shared component classes.
└── assets/                  # Logos (processed by astro:assets → webp).

public/                      # favicons, og-image.png, robots.txt (copied verbatim)
```

---

## 5. Design system (`src/styles/global.css`)

Tokens live in `:root`; theme values swap under `:root[data-theme='dark']` /
`[data-theme='light']`.

**Dark is the default and must stay the default.** Light mode is opt-in only.

Brand colours were sampled from the actual logo (`src/assets/brand-mark.jpg`),
not invented:

```
--brand-red-deep #48020a   --brand-red #7e1b2d
--brand-purple   #1a1050   --brand-blue #2c3695   --brand-blue-deep #000652
```

Those are too dark for UI glow, so there is a parallel **luminous** set used for
neon/gradients/gradient text: `--accent-red #ff4d6d`, `--accent-violet #8b6cff`,
`--accent-blue #6c7cff`, `--accent-cyan #57e2ff`.

Reusable classes (prefer these over writing new CSS):
`.container` `.section` `.section-head` `.grid` `.grid-2/3/4` `.pill` `.eyebrow`
`.btn` `.btn-primary` `.btn-ghost` `.btn-sm` `.btn-block` `.glass-card`
`.icon-tile` `.grid-bg` `.scanline` `.orb` `.noise` `.stat-value` `.stat-label`
`.marquee` `.field` `.form-status` `.mono` `.display` `.h2` `.h3` `.lead`
`.text-gradient` `.visually-hidden` `.skip-link`

### Terminal contrast rule (was a reported bug — do not regress)
`Terminal.astro` uses its own fixed `--term-*` tokens defined **outside** the
theme blocks, so the console stays dark and legible in light mode. Never wire the
terminal to `--bg` / `--surface` / `--text`.

---

## 6. Animation & 3D architecture

### `scripts/animations.js` (all pages)
- **Nothing is hidden in the markup.** CSS never sets `opacity: 0`. JS hides
  elements then reveals them, so if the bundle fails to load the page is still
  fully readable. **Preserve this property.**
- Hero intro: `.line-inner` mask slide-up + staggered `[data-hero]` fade.
- Scroll reveals: `.reveal` elements, grouped by parent so grids stagger together.
- `[data-counter]` + `data-counter-suffix` → animated number counters.
- `[data-parallax="0.2"]` → scroll-scrubbed drift (used on `.orb`s).
- `[data-tilt]` → pointer tilt, desktop only.
- Cursor sheen: sets `--mx` / `--my` on `.glass-card` and `.contact-row`.
- **Fail-safe:** `showAll()` runs on a 4s timeout and on a post-load check. It
  calls `gsap.killTweensOf()` **first** — an in-flight tween otherwise rewrites
  the transform on its next tick and the rescue silently does nothing.
- Everything is skipped under `prefers-reduced-motion`.

### `scripts/hero-scene.js` (homepage only)
Interactive infrastructure topology: ~96 nodes on a Fibonacci sphere, nearest-
neighbour links, **190 packets travelling along those links**, expanding energy
rings, wireframe core, 1,400-point dust field, exponential fog. Mouse drives
rotation; scroll drives camera dolly.

Performance rules already in place — keep them:
- **Lazily imported** by `HeroScene.astro` via `IntersectionObserver` +
  `requestIdleCallback`. Three.js is a separate ~130KB gz chunk that never blocks
  first paint. Initial JS is ~45KB gz.
- Node/packet/dust counts and `devicePixelRatio` are reduced below 820px.
- The rAF loop early-returns when off-screen or the tab is hidden.
- `drawFirstFrame()` renders one composed frame immediately, so a page opened in
  a **background tab** never shows an empty canvas.
- Reduced-motion renders a single static frame and returns.
- Returns a `{ destroy() }` handle.
- Fails soft: if WebGL is unavailable it returns `null` and the loader removes
  the canvas. The hero must always stand on its own without the 3D layer.

---

## 6a. Contact form & spam protection (`src/pages/contact.astro`)

Submits to Web3Forms. Two layers of spam protection:

1. **Honeypot** — a `visually-hidden` `botcheck` checkbox. Bots tick it, humans
   never see it.
2. **hCaptcha** — `<div class="h-captcha" data-captcha="true">`, rendered by
   `https://web3forms.com/client/script.js` (loaded `is:inline async defer` so
   Astro doesn't bundle it and strip the attributes).

Implementation notes:
- **No sitekey is hardcoded.** Web3Forms is zero-config: its client script injects
  the shared sitekey at render time. Don't add `data-sitekey`.
- `data-theme` on the captcha div is set from the site's current theme before the
  widget renders. Known limitation: toggling the theme afterwards does not
  re-render the widget, so it keeps the theme it was created with until reload.
- The form posts via `fetch()`, and `new FormData(form)` picks up the
  `h-captcha-response` textarea automatically — no manual token handling needed.
- Submit is gated on that token. The docs suggest `alert()`; we surface a styled
  message in the existing `aria-live` status region instead.
- `hcaptcha.reset()` runs in the `finally` block. Tokens are single-use and
  `form.reset()` does not clear the widget, so without it a second send would
  reuse a spent token.
- Requires the dashboard toggle — see §9.4.

---

## 6b. Free tools (`src/pages/tools/`)

Lead-generation tools, not a utility directory. The bar for adding one: **does it
attract someone who might buy infrastructure work?** A tool that surfaces a
problem Lex Corp fixes (a missing DMARC record) is worth far more than one with
higher traffic and no commercial intent. Consumer utilities — Nepali date or
Unicode converters — were considered and deliberately rejected on that basis;
they would pull volume but dilute an enterprise consultancy's positioning.

**Tool pages must live on the main domain** (`/tools/…`), never a subdomain.
Subdomains split ranking authority, which defeats the point. Each tool ends with
a contextual CTA converting findings into a conversation.

### `email-security.astro` + `scripts/email-scan.js`
Checks SPF, DKIM, DMARC and MX for any domain. **No backend** — Cloudflare's
DNS-over-HTTPS resolver is CORS-open, so it all runs in the visitor's browser.
No API key, no server cost, nothing to rate-limit.

Design rules that matter more than the score:
- **DKIM reports "inconclusive", never "fail", when no key is found.** Selectors
  are chosen freely by whoever configured mail and cannot be enumerated from DNS.
  We probe 18 common provider selectors; a miss proves nothing. Google itself
  returns inconclusive because it uses rotating date-based selectors — reporting
  that as a failure would make the whole tool untrustworthy.
- Multiple SPF records are scored as a **fail**, not a warning: RFC 7208 makes
  that a permerror, so it is actively worse than a soft misconfiguration.
- `+all` is penalised more heavily than a missing SPF record, because it
  explicitly authorises the whole internet.
- SPF's 10-DNS-lookup limit is counted; exceeding it silently breaks evaluation.

Accepts `?domain=example.com` for deep links and shareable results.

**Feasibility notes for future tools** (verified from a browser, not assumed):
DNS-over-HTTPS ✅ CORS-open · RDAP `rdap.org` ✅ CORS-open · fetching arbitrary
site HTML ❌ CORS-blocked, needs a proxy · `.np` WHOIS ❌ **does not exist** —
IANA's record for `.np` has an empty `refer:` field, so no port-43 server is
published even from a VPS. A `.np` checker can only infer registration from
`NXDOMAIN` vs `NOERROR`.

---

## 7. Content & contact data

Edit `src/config/site.js` and `src/data/services.js` — **never hardcode contact
details in a page.**

Current, correct values. An older personal address was fully purged; do not
reintroduce `laxman.chaudhary@lexcorp.com.np` anywhere:

```
Location  Kathmandu, Nepal
Phone     +977-9842028183
Email     info@lexcorp.com.np
LinkedIn  https://www.linkedin.com/in/laxman-chaudhary
```

Service copy derives from the company profile at
`~/Desktop/LEX CORP/Company_Profile.md` (8 service domains, 15 technologies,
5 differentiators). Keep new copy factual — no invented client names, logos,
case studies, or metrics. The "cluster health" panel on the homepage is labelled
*"Illustrative targets from managed engagements"* precisely because those numbers
are not real measurements; keep a disclaimer if you touch it.

---

## 8. Environment variables

`.env` is gitignored; `.env.example` is committed. Astro requires the `PUBLIC_`
prefix for anything used in a page/component, and these are **inlined at build
time**, not read at runtime — so whichever machine runs `npm run build` needs
them present.

| Var | Purpose |
| --- | --- |
| `PUBLIC_WEB3FORMS_ACCESS_KEY` | Contact form. Already set locally. Publishable by design — it ships in the page source, so it can be recovered from `dist/contact/index.html` if `.env` is lost. |
| `PUBLIC_SITE_URL` | Canonical/OG/sitemap origin. |
| `PUBLIC_ANALYTICS_ID` | GA4 measurement id. Set locally to `G-QK4R30ST26`. `BaseLayout.astro` injects the standard gtag.js snippet only when this is non-empty, on every page. |

**Analytics setup used the "Install manually" method in Google's wizard, but the
snippet is never pasted by hand** — `BaseLayout.astro` emits it from this variable.
Supplying the id is the whole install. Because `.env` is gitignored and these vars
are inlined at build time, **`PUBLIC_ANALYTICS_ID` must also be set in the Vercel
dashboard**, or production builds will ship with analytics silently disabled.
Google's "Test installation" button only works against the deployed URL.

`astro.config.mjs` resolves the site URL as:
`PUBLIC_SITE_URL` → `https://$VERCEL_URL` (auto on preview deploys) →
`https://www.lexcorp.com.np`. This keeps canonical tags correct on Vercel
previews. It imports `loadEnv` from **`vite`**, not from `astro/config` — that
export does not exist there and will fail the build.

---

## 9. Outstanding work

1. **Vercel not connected.** Import the repo (Astro is auto-detected), then set
   the three `PUBLIC_*` vars in Project Settings → Environment Variables — Vercel
   builds from its own env, not the local `.env`.
2. **Analytics id is set locally but not in Vercel** — add `PUBLIC_ANALYTICS_ID`
   there too, then use Google's "Test installation" against the live URL.
3. **The contact form has never been submitted end-to-end** — send one real test
   and confirm it lands in the Web3Forms inbox.
4. **hCaptcha must be enabled in the Web3Forms dashboard** (Settings → Spam
   Protection → enable hCaptcha). The markup is already in place, but until that
   toggle is on, Web3Forms will not verify the token server-side. Note the widget
   shows a "localhost detected" warning locally — that is expected with the shared
   test sitekey and disappears on the real domain.
5. Not yet run: Lighthouse audit, cross-browser check (Safari/Firefox), real-device
   mobile pass.
6. `README.md` is still partly Astro starter boilerplate.

---

## 10. Traps that already bit (don't repeat)

- **`.container` + a narrower `max-width` = accidental centring.** `.container`
  has `margin-inline: auto`; overriding its `max-width` on that same element
  re-centres the whole block and knocks copy out of alignment with content below.
  Constrain the *children* instead: `.x-hero-in > * { max-width: 46rem }`.
- **Stale dev server.** After deleting or renaming components, Astro's dev HMR can
  keep serving removed modules and drop scoped styles, producing phantom bugs.
  Kill the process and rebuild before believing a CSS problem is real — confirm
  against `npm run build` output, which is the source of truth.
- **`display: inline` spans can't be transformed.** The hero headline masks rely on
  `.line { display: block; overflow: hidden }`. If that rule goes missing the lines
  run together ("theinfrastructure") and GSAP's `yPercent` silently no-ops.
- **Background tabs report `document.visibilityState === 'hidden'`** and throttle
  rAF. Any new animation must paint an initial frame rather than waiting for
  visibility, or first-time visitors arriving in a background tab see blanks.
- Astro `<style>` blocks are scoped; use `:global()` for anything targeting markup
  rendered by a child component.
- **`define:vars` on a `<script>` wraps the body in an IIFE.** That broke the GA4
  snippet: `function gtag(){}` became closure-scoped, so pageviews worked but any
  later `gtag('event', …)` threw `gtag is not defined`. Third-party snippets that
  must expose globals need `is:inline` + `set:html` so they're emitted verbatim.

---

## 10a. Git identity (Vercel will refuse to build without this)

Vercel matches the **commit author email against a verified email on the GitHub
account**. It rejected a deployment outright with "the commit author email is not
a valid email address" because commits were authored as `info@lexcorp.com.np`,
which is not registered on the account.

This repo is therefore configured **locally** to use the GitHub noreply address:

```bash
git config user.email "17145173+laxman-chaudhary@users.noreply.github.com"
```

Noreply is deliberate over the personal address: the repo is **public**, and
commit emails in public history get scraped for spam. If you would rather commits
carry `info@lexcorp.com.np`, add and verify it under GitHub → Settings → Emails
first, then change this config — Vercel will accept it once it is verified.

Note this is a **repo-local** setting; the global config still points elsewhere,
so a fresh clone on another machine will hit the same Vercel error until this is
set again there.

---

## 11. Conventions

- Comment only to explain a constraint the code can't express (why the terminal has
  its own palette, why `killTweensOf` comes first). No narration of what a line does.
- Prefer extending `global.css` tokens/classes over new one-off CSS.
- All icons go through `Icon.astro` so stroke weight and grid stay consistent.
- Accessibility is not optional: real `<label>`s behind floating labels, `aria-live`
  on the form status, `aria-current` on nav, `aria-hidden` on decorative canvas/SVG,
  visible focus rings, a skip link, and a full `prefers-reduced-motion` path.
- Every page passes `title` + `description` to `BaseLayout`.
