# Lex Corp — Website

Marketing site for **Lex Corp Pvt. Ltd.** (Kathmandu, Nepal) — cloud, DevOps,
software, AI, cybersecurity, and digital transformation services.

Built with **Astro** (static output), **GSAP** for motion, and **Three.js** for
the interactive infrastructure topology in the hero.

> **Working on this codebase — human or AI?** Read **[`AGENTS.md`](./AGENTS.md)**
> first. It documents the architecture, design system, content model, env vars,
> outstanding work, and several non-obvious traps. `CLAUDE.md` is a symlink to it.

---

## Quick start

```bash
npm install
cp .env.example .env    # then fill in the values (see AGENTS.md §8)
npm run dev             # http://localhost:4321
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Static production build → `dist/` |
| `npm run preview` | Serve `dist/` over HTTP — **use this to check the build** |

> Don't open `dist/index.html` directly as a `file://` URL. Asset paths are
> root-absolute and only resolve over HTTP, so the page will look broken when it
> isn't. Always use `npm run preview`.

## VS Code

Install the recommended extension when prompted (`astro-build.astro-vscode`) —
it provides `.astro` syntax highlighting, IntelliSense, and formatting. A
"Development server" launch configuration is included in `.vscode/launch.json`.

## Deploying

Static output, so any web server or static host works.

**Vercel (intended):** push to `github.com/lexcorp-cloud/website`, import the repo
(Astro is auto-detected), then add the `PUBLIC_*` variables under Project
Settings → Environment Variables. They're inlined at build time, so Vercel needs
its own copy — the local `.env` is not used.

**Self-hosted:** run `npm run build` on a machine that has `.env`, then serve
`dist/` (nginx example in `AGENTS.md`-adjacent notes; `try_files $uri $uri/
$uri/index.html`).

## Structure

```
src/
├── config/site.js      # contact details + env-backed keys (edit here, not in pages)
├── data/services.js    # services, technologies, process, stats
├── layouts/            # BaseLayout: head, SEO, JSON-LD, theme bootstrap
├── components/         # Header, Footer, HeroScene, Terminal, PipelineFlow, Icon, ThemeToggle
├── pages/              # index, services, about, contact
├── scripts/            # animations.js (GSAP), hero-scene.js (Three.js, lazy)
└── styles/global.css   # design tokens + shared classes
```

## License

Proprietary — © Lex Corp Pvt. Ltd. All rights reserved.
