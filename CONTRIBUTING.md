# Contributing

- Code, comments, commit messages, issues, and docs are in English.
- Work starts from an issue. Each pull request closes one issue, carries its tests and docs, and is merged to `main` once CI is green.
- Every change must work with several web nodes behind a load balancer: keep no state in process memory or on local disk that another node would need (use the shared cache or the backend instead).
- Pages must work in RTL and LTR: use logical CSS (`ms-*`, `pe-*`, `start-*`), never `left`/`right` for layout.
- Use the design system's semantic colors (`bg-surface`, `text-muted`, `text-up`), never raw colors; see [docs/design-system.md](docs/design-system.md).
- Server code that must never reach the browser imports `server-only`.
- Before pushing: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
