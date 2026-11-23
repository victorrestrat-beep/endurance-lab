# ADR 0001: Monorepo and tooling

- Status: accepted
- Date: 2026-11-23

## Context

The project will grow from one library into an ingestion pipeline, an API and a web dashboard that
share types and models. One person maintains it today, but it should read like a codebase a team
could work in.

## Decision

- **One pnpm workspace** (`packages/*`, later `apps/*`). The models live in their own package, so
  the API and the dashboard will depend on them like on any other library.
- **TypeScript in strict mode**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Packages are native ESM with `NodeNext` resolution and build to `dist/` with declaration files.
- **Biome** for linting and formatting: one fast tool and one configuration file instead of ESLint
  and Prettier.
- **Vitest** for tests and benchmarks, **fast-check** for property-based tests. Coverage thresholds
  are enforced in CI.
- **GitHub Actions** runs lint, type checking, tests with coverage and the build on every push and
  pull request.

## Consequences

- Adding `packages/fit`, `packages/db` or `apps/api` takes a `package.json` and a `tsconfig.json`;
  the rest of the tooling does not change.
- Biome has fewer rules than typescript-eslint and none based on type information. If the API code
  needs rules such as `no-floating-promises`, typescript-eslint can be added to that package.
