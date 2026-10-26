# PUVO Admin

Independent Next.js application for the PUVO operations team. It shares the existing API and PostgreSQL database with the marketplace; it does not connect to the database directly.

## Local development

```sh
pnpm install
pnpm --filter @puvo/admin dev
```

By default, `/api/v1/*` is rewritten to `http://localhost:4000/api/v1`. Set `API_INTERNAL_URL` for a different local/container API. The production build uses `API_PUBLIC_URL` or the existing Railway API default.

## Access

Sign in with an existing PUVO account that already has `platform_owner`, `administrator`, or `moderator`. The API remains the authorization boundary for all operational actions. The login session cookie is host-only to the console domain; the marketplace cookie is not shared across subdomains.

The team invitation and role-management screen is not implemented yet. Do not assign roles from this frontend; use the established controlled operational procedure until an audited team workflow is available.

## Separate deployment

The Vercel project `praca-angola-admin` uses `apps/admin` as its root and includes the shared `packages/ui` source. Preview is deployed at `https://praca-angola-admin-qlk4ms9uk-vitaleevos-projects.vercel.app`; `https://gestao.puvo.vitaleevo.ao` is verified and currently aliased directly to that Preview deployment for validation. Reassign the domain to a newly approved deployment after staff login, role permissions, operations, and rollback have been validated. Administrative pages and links stay outside the public marketplace.
