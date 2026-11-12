# FluxGantt docs site

The documentation + landing site for [FluxGantt](https://github.com/thai-pc/fluxgantt), built with
[Vocs](https://vocs.dev) and served at **https://fluxgantt.thai-pc.com**. The home page doubles as
the marketing landing page. Content lives in `pages/` (`rootDir: '.'` in `vocs.config.ts`).

The library itself (code, examples, the product spec, launch material) lives in the monorepo
[`thai-pc/fluxgantt`](https://github.com/thai-pc/fluxgantt). This repo was split out of its
`apps/docs` folder with `git subtree split`, so the history of every page is preserved here.

## Develop

Node is pinned in `.nvmrc` (the same version the monorepo uses); npm is the package manager.

```bash
nvm use                 # Node from .nvmrc
npm ci                  # install from package-lock.json
npm run dev             # dev server
npm run build           # static build -> dist/public, then scripts/finalize-pages-build.mjs
npm run check           # typecheck + snippet-import check
```

## Structure

```
vocs.config.ts                # site config: title, sidebar, topNav, theme (indigo accent)
pages/
  index.mdx                   # home / landing
  docs/*.mdx                  # guides, concepts, interactions, frameworks, reference
scripts/
  finalize-pages-build.mjs    # validates dist/public after `vocs build` (see Deploy)
  check-snippet-imports.mjs   # snippet imports vs the published @fluxgantt/* packages
.github/workflows/ci.yml      # install, typecheck, check:imports, build
```

## Keeping the docs in step with the library

The docs describe the **published** `@fluxgantt/core`, `@fluxgantt/react` and `@fluxgantt/vue`.
They are exact-pinned in `package.json`. Nothing on the site imports them at runtime (every
example is a code block), but `npm run check:imports` loads them and fails if a snippet imports a
subpath or a name the pinned release does not export.

After each library release:

1. Bump the three pins to the new versions (`npm view @fluxgantt/core version`, likewise for
   `react` and `vue`) and run `npm install` so `package-lock.json` follows.
2. Update the figures that used to be machine-synced from the monorepo. **Bundle sizes and other
   numbers are now updated by hand**: re-measure with `pnpm size` in the monorepo and edit the
   values inside the `{/*sz:key.N*/}…{/*/sz*/}` markers (`pages/index.mdx`,
   `pages/docs/comparison.mdx`, `pages/docs/examples.mdx`). The markers are kept so the figures
   stay easy to find with `grep -rn 'sz:' pages`.
3. Re-check the quick-start snippet in `pages/docs/quick-start.mdx` against the region marked
   `#region quickstart` in the monorepo's `examples/plain-html-demo/src/main.ts`.
4. `npm run check && npm run build`, then open a PR.

A feature PR in the monorepo that changes documented behaviour needs a matching PR here.

## Deploy (Cloudflare Pages)

Production is `https://fluxgantt.thai-pc.com`, served by Cloudflare Pages through its Git
integration: every push to `main` deploys, and every PR gets a preview URL on `*.pages.dev`.
Nothing in `.github/workflows/` deploys; `ci.yml` only build-checks.

Dashboard: **Workers & Pages → Create → Pages → Connect to Git** → this repository.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | **None** |
| Root directory | `/` (leave empty) |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist/public` |
| Environment variables (Production **and** Preview) | `SKIP_DEPENDENCY_INSTALL` = `1` |
| Custom domain | `fluxgantt.thai-pc.com` (Custom domains tab; Cloudflare creates the proxied CNAME and the certificate) |

- **Node:** do **not** set `NODE_VERSION`. The build image reads `.nvmrc`, the same file CI and
  local dev use. Only if the build log shows a different Node should `NODE_VERSION` be set, and
  then to the value in `.nvmrc`.
- **`SKIP_DEPENDENCY_INSTALL=1`** stops the image from running its own install before the build
  command, so the one install is the build command's `npm ci`: a clean, lockfile-exact install,
  identical to CI's.
- **No browser** is needed by the build.

The output is `dist/public` (23 HTML files), not `dist/`, which also holds an SSR server bundle
the static deploy does not use.

Three settings in `vocs.config.ts` are what make this work:

| Setting | Why |
|---|---|
| `renderStrategy: 'full-static'` | Vocs defaults to `'dynamic'`, which emits an SSR server and **zero HTML**. |
| `baseUrl: 'https://fluxgantt.thai-pc.com'` | Canonicals, `og:url`, `sitemap.xml` and `robots.txt` are built from it. No `basePath`: the site is served from the domain root. |
| `head.base: false` | Vocs otherwise emits `<base href="${baseUrl}">`, which points every root-relative asset at production — a preview deploy or a local serve would then run production's scripts. |

`scripts/finalize-pages-build.mjs` fails the build if there is no HTML, if a `basePath` is set, if
a page carries an absolute `<base href>`, or if any `/assets/...` URL a page references is missing
from the output.

Vocs emits `pages/docs/x.mdx` as `docs/x/index.html`, so Cloudflare answers `/docs/x` with a 308 to
`/docs/x/`. Client-side navigation uses the slash-less form and works either way.

### Previewing the built site

`wrangler pages dev` is the closest local stand-in for Cloudflare (same trailing-slash redirects
and `404.html` handling). It runs entirely locally and needs no Cloudflare login:

```bash
npm run build
npx wrangler@4 pages dev dist/public --port 5241
# http://127.0.0.1:5241/
```

`python3 -m http.server 5241 -d dist/public` also works for a quick look.

## License

[MIT](./LICENSE), same as FluxGantt.
