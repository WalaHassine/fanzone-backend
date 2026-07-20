# Test Strategy

How this backend is tested, and what is deliberately left untested.

Companion document: [traceability-matrix.md](traceability-matrix.md) — generated, shows
which requirement from [design-document.md](design-document.md) §7 is covered by which test.

## Principle

Tests are the documentation. There is no prose file describing what each test does — the
test name does that, and unlike a document it cannot fall out of date. Anything that would
otherwise drift (the coverage matrix) is generated from the suite rather than written by hand.

## Layers

| Layer | Location | Scope | Database | Command |
|---|---|---|---|---|
| Unit | `src/**/*.spec.ts`, colocated with the code | DTO validation, pure functions, service logic with mocked repositories | No | `npm test` |
| E2E | `test/*.e2e-spec.ts` | HTTP request in → status + body out; guards, global `ValidationPipe`, exception filter | Yes | `npm run test:e2e` |

Unit tests must stay fast and dependency-free — no database, no network, no filesystem. If a
test needs any of those, it belongs in the E2E layer.

The two layers answer different questions. A unit test proves `RegisterDto` rejects a weak
password; only an E2E test proves the global `ValidationPipe` is actually wired up so that
rejection becomes a real HTTP 400.

## Naming convention

**Every `describe` block covering a functional requirement carries its requirement ID.** This
is what makes the traceability matrix work — the generator extracts `EF-\d{2}` and `ENF-\d{2}`
from test titles.

```ts
describe('RegisterDto (EF-01)', () => {
  it('rejects a password shorter than 8 characters', () => { ... });
});
```

Test names describe observable behavior, not implementation:

- ✅ `rejects a malformed email`
- ❌ `should call validate() on the email field`

The first still reads correctly after a refactor; the second describes internals and breaks
the moment they change.

## Requirements traceability

The design document lists **Traçabilité** (§2.4) as a design success criterion: every
functional requirement must map to an identifiable component. The matrix operationalises that
for tests.

```bash
npm run test:trace     # runs the suite, regenerates docs/traceability-matrix.md
```

- Requirement metadata lives in [`scripts/requirements.json`](../scripts/requirements.json),
  transcribed from design-document.md §7. Update it there when the spec changes.
- `docs/traceability-matrix.md` is **generated — never edit it by hand**; your edits will be
  overwritten on the next run.
- Regenerate whenever tests are added or requirement IDs change, and commit the result so the
  matrix is readable without running the suite.

A requirement with no matching test appears as ⬜ automatically. The matrix is designed to
show gaps, not to hide them — a low coverage count is information, not a failure.

## Out of scope

Deliberate decisions, not oversights:

| Not tested | Why |
|---|---|
| TypeORM behaviour (entity persistence, cascades, eager loading) | Framework code; testing it tests the library, not this application |
| NestJS dependency injection and module wiring | Same reason — a broken module fails loudly at boot |
| `@ApiProperty` / Swagger output | Metadata with no runtime behavior; verified by opening `/api/docs` |
| Frontend requirements (EF-08, ENF-02, ENF-06, ENF-10) | Different repository |
| Architectural requirements (ENF-08, ENF-11) | Verified by code review, not automated tests |
| Third-party AI provider responses | Non-deterministic; the provider interface is mocked instead |

## Coverage

No percentage threshold is enforced. A blanket target drives tests for trivial getters and
inflates the number without improving confidence — coverage is read as a diagnostic
(`npm run test:cov`), not treated as a gate. The traceability matrix is the more meaningful
signal: it measures whether *requirements* are verified, not whether *lines* were executed.

A threshold may become worthwhile once the service layer carries real business logic, at which
point it should be scoped to those modules rather than applied repo-wide.

## Running the tests

```bash
npm test               # unit tests
npm run test:watch     # unit tests, watch mode
npm run test:cov       # unit tests with a coverage report
npm run test:e2e       # end-to-end tests (requires a running database)
npm run test:trace     # regenerate the traceability matrix
```
