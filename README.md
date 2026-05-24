# Margins

A quiet tech blog. Built with [Astro](https://astro.build), Tailwind v4, and Bun.
Posts live as markdown in `src/content/posts/` and ship as static HTML to Digital Ocean Spaces + CDN.

## Local development

```sh
bun install
bun run dev        # http://localhost:4321
bun run build      # outputs to dist/
bun run preview    # serves dist/ for a final look
```

`bun run astro sync` regenerates the content collection types under `.astro/` if your
editor's TypeScript server gets stale (rarely needed in normal use).

## Writing a post

Drop a `.md` file in `src/content/posts/`. **The filename (minus `.md`) is the URL slug** —
e.g. `simple-cli-spinner.md` → `https://untounium.dev/posts/simple-cli-spinner`.

Frontmatter schema:

```yaml
---
title: "Post title"
datePublished: 2026-05-24T10:00:00.000Z
cover: https://cdn.example.com/cover.jpg            # or /images/local.jpg
seoTitle: "Optional shorter title for SEO"          # optional
seoDescription: "Optional summary, also used as the homepage excerpt and meta description."  # optional
ogImage: https://cdn.example.com/og-image.png       # optional, falls back to cover
tags: tag-one, tag-two, tag-three                   # optional, comma-separated; first tag shows as category pill
---
```

`cover` accepts either a full URL (CDN, S3, etc.) or a site-absolute path like
`/images/foo.jpg` pointing at `public/images/foo.jpg`.

The schema is enforced by Zod in `src/content.config.ts` — `astro build` fails if
a post doesn't validate. Unknown frontmatter fields (e.g. legacy `cuid`/`slug` on
imported Hashnode posts) are silently stripped.

The post body is standard markdown. Code fences are syntax-highlighted by Shiki
(`github-dark-dimmed`). Use lowercase language identifiers (`javascript`, not
`Javascript`).

## Deployment

The site is served from an existing Digital Ocean droplet:

- **Host:** `untounium.dev` → `138.68.238.161` (Ubuntu 24.04, SFO2)
- **Web server:** Caddy 2.x with automatic Let's Encrypt TLS
- **Document root:** `/var/www/untounium.dev/`
- **Caddyfile:** `/etc/caddy/Caddyfile`

Pushes to `main` trigger `.github/workflows/deploy.yml`, which:

1. Builds the site with Bun (`SITE_URL=https://untounium.dev`).
2. Rsyncs `dist/` to the droplet over SSH using a dedicated CI deploy key
   (`--delete` keeps the document root in sync with the local build).
3. Smoke-tests the homepage and about page over HTTPS.

Caddy serves files dynamically from disk; **no reload is needed** for content updates.
A reload is only required if the Caddyfile changes.

### Required repo secret

Only one secret is needed (everything else is hard-coded in the workflow file and
versioned with the repo):

| Secret                  | What it is                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `BLOG_DEPLOY_SSH_KEY`   | Private key contents of the dedicated CI deploy key (`~/.ssh/blog_deploy_ci`). The matching public key lives in `/root/.ssh/authorized_keys` on the droplet. |

To set it: `cat ~/.ssh/blog_deploy_ci | pbcopy`, then paste into GitHub → Settings →
Secrets and variables → Actions → New repository secret.

### Manual deploy from a workstation

```sh
SITE_URL=https://untounium.dev bun run build
rsync -avz --delete -e "ssh -i ~/.ssh/do_deploy_key" \
  dist/ root@138.68.238.161:/var/www/untounium.dev/
```

### Editing the Caddyfile

SSH in and edit `/etc/caddy/Caddyfile`. After changes:

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

The previous Caddyfile is backed up at `/etc/caddy/Caddyfile.bak-2026-05-20` if
you need to roll back.

## Project structure

```
.
├── .github/workflows/deploy.yml   # CI: build + sync + CDN purge
├── astro.config.mjs               # Astro + Tailwind + Shiki
├── public/                        # Static assets served at site root
│   └── images/amplify-datastore-android/   # Post-specific image bundle
├── src/
│   ├── components/                # Astro components (Header, Footer)
│   ├── content/posts/             # Markdown blog posts
│   ├── content.config.ts          # Zod schema for post frontmatter
│   ├── layouts/Layout.astro       # HTML shell + meta tags
│   ├── lib/posts.ts               # Helpers: excerpt, readTime, etc.
│   ├── pages/
│   │   ├── index.astro            # Homepage post list
│   │   ├── about.astro            # Colophon
│   │   └── posts/[slug].astro     # Dynamic post pages
│   └── styles/global.css          # Tailwind + design tokens
└── package.json
```
