# ADR 0002: Analyzer runtime and queue foundation

- Status: Accepted
- Date: 2026-08-29

## Context

The analyzer needs a lightweight service during setup, but product parsing and later queue work must be separated from the initial infrastructure stage.

## Decision

- Use FastAPI with Pydantic settings for service configuration.
- Keep a minimal health API that proves the process and dependency wiring can run.
- Choose Dramatiq with Redis for the prototype queue later.
- Build the analyzer as a separate workspace from the web application.

## Consequences

- The analyzer is isolated from the browser-facing app.
- Health probing can be implemented without touching parser or enrichment work.
- Queue and worker behavior are explicitly deferred until the product phase.
- The web app can remain independent of analyzer internals.
