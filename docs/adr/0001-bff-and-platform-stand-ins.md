# ADR 0001 — One BFF over in-process platform stand-ins

**Status:** Accepted · 2026-10-03

## Context

The Academy site must connect to nine Scholarion platform services (Integration Spec §3), and none of them exposes a stable API to this repo yet. The site still needs to run every flow end to end now: audit, trial, lab, credential, aid, live and support. Each connection then has to flip to the real service one at a time without rewriting pages.

## Decision

1. **A single BFF** (`src/bff/api.ts`, mounted at `/api/v1/*`) is the only door the browser uses. Pages read through BFF read models (`src/bff/views.ts`). The router is framework-agnostic (standard `Request`/`Response`), so it is tested without Next.js.
2. **A platform façade** (`src/platform/index.ts`) exposes one module per service with typed contracts (`src/platform/types.ts`). Today each module is an in-process stand-in that keeps its own collections in a shared store and persists to `.data/db.json` in dev.
3. **A platform event bus** (`src/platform/bus.ts`) carries CloudEvents 1.0 with idempotent consumers. Cross-service reactions (lab → gradebook, completion → credential, events → email) happen only through events, exactly as they will in production.
4. **Every stand-in reports SIMULATED** on the status board. A connection becomes CONNECTED only when its module is replaced by a client that calls the real service, and the same acceptance tests pass.

## Consequences

- Pages and the BFF don't change when a service connects; only one façade module does.
- The in-process store is single-node and in-memory. Running more than one server instance needs the real services or a shared Postgres (see `db/schema.sql`).
- The Cloud Lab local runner executes code on the host and is development-only.
- The credential signer uses a project-specific cryptosuite label. Production must use a conformant Data Integrity implementation.

## Alternatives considered

- **Mock HTTP servers per service:** closer to production, but they add process management to local dev without changing the contracts. Deferred until the first real service connects.
- **Calling services directly from pages:** rejected. It breaks the "one door" rule and spreads auth and entitlement logic.
