# Team Tetris Exoplanet Explorer — Agent Rules (`AGENTS.md`)

**Source of Truth:** Read `docs/ARCHITECTURE.md` and `docs/PROGRESS.md` before doing anything. If your instructions and `docs/ARCHITECTURE.md` ever conflict, **stop and ask the humans** (except the safety rules in Section 1 below, which always win). Any deviation requires a proposal in `docs/DECISIONS.md` and human approval before coding.

## 1. Non-Negotiable Rules

### Data Honesty
- **No invented science:** Never invent, estimate, round-fill, or "typical-value" any scientific measurement. Missing means `null` in data and a grey `"unknown"` in the UI. Never turn a blank into `0`.
- **No invented schemas/APIs:** Never invent API responses, column names, table names, URLs, coefficients, or credentials. Discover them from real files/services or ask.
- **Immutable raw data:** Never edit raw CSVs. Preserve every row. Do not silently deduplicate.
- **Provenance tags:** Every number is a `Field` with a receipt (`<planetId>.<fieldName>`). Derived values are tagged `calculated` (published formula on archive inputs) or `derived` (explorer heuristic) and list their `inputs`.
- **No runtime catalog calls:** The browser and Vercel function never call NASA, exoplanet.eu, or Exo-MerCat. Only build scripts in `scripts/` do.

### Science Framing
- **No habitability verdict:** Never say or imply a planet is habitable, uninhabitable, or supports life—in code, UI, or AI text. Use `"habitable zone"` and `"potential habitability indicators"`.
- **Candidates vs confirmed:** Candidates are never presented as confirmed planets.
- **Honest visual labels:** Planet visuals must be labelled `"Artist's impression"`. Altered scales and orbits must be labelled `"not to scale"`. Always mount `<DetectionBiasCaveat/>` where required.
- **Licensing gate:** Do not claim unverified data licences. `crosscatalog.json` stays git-ignored until verified terms are recorded in `docs/DECISIONS.md` by a human.

### Security
- **Protect API keys:** Never put `FEATHERLESS_API_KEY` in frontend code, `VITE_*` variables, public files, Git, logs, or chat. Never read, print, or ask the user to paste the key. Humans create `.env.local`.
- **Server-only LLM:** Only the server function (`/api/helm`) calls Featherless.

### Scope & Dependencies
- **In scope:** Only what `docs/ARCHITECTURE.md` lists.
- **Out of scope:** Astronaut character, light-travel postcard, Voice, Sonification, What-If Slider, YourAge, Sunrise, Journey Calculator, RealScale, JWST badge, Open Exoplanet Catalogue, Gaia, accounts, databases.
- **Allowed new dependencies:** `zustand`, `zod`, `d3-scale`, and `vitest` (dev). Any other package requires human approval in `docs/DECISIONS.md`.
- **Do not break builds:** Never leave `main` or a phase branch with a broken build. Ask before deleting or overwriting existing files.

### Git
- Work on branch `phase/<n>-<name>`. Run `git status` and show the user before starting each phase.
- Commit small, meaningful commits to the phase branch after build and tests pass.
- Never push, merge, rebase, force-push, or switch to `main` unless explicitly asked by the humans.

## 2. Roles, Models & File Ownership

Start one new conversation per phase/role. Each conversation reads `AGENTS.md`, `docs/PROGRESS.md`, and relevant sections of `docs/ARCHITECTURE.md`.

| Role | Recommended Model | Owns (only edits these paths) |
|---|---|---|
| **Data engineer** | Argon 4 (or Opus 4.6 fallback) | `scripts/`, `shared/domain/`, `data/`, `public/snapshots/`, `tests/domain.*` |
| **HELM engineer** | Argon 4 (or Opus 4.6 fallback) | `server/`, `api/`, `src/helm/`, `tests/validate.*`, `tests/canned.*` |
| **3D / frontend engineer** | Flash (panels, CSS, tooltips, UI tests); Argon 4 (`src/scene/`) | `src/` (except `src/helm/`) |
| **Reviewer / Integrator** | Claude Opus 4.6 (or Argon 4 after 2 Nov 2026) | `docs/REVIEWS.md`, `shared/schemas.js`, `shared/filters.js`, `shared/receipts.js`, cross-module integration & review |

### Coordination Rules
- At most **two writing conversations at the same time**, in disjoint folders.
- **Single-writer shared files:** `shared/schemas.js`, `package.json`, `src/store/explorerStore.js`, `vercel.json`. Request changes in `docs/PROGRESS.md` for human approval and Integrator execution.
- **Escalation:** If something fails twice, stop and explain instead of guessing. Escalate bugs surviving two Flash attempts to Argon 4, then Opus 4.6.

## 3. Phase Gate Protocol

At the end of every phase:
1. Run `npm run build` and `npm test` (once configured).
2. Report in plain language: what was built, files changed, test results, data sizes/counts, uncertainties, and what was **not** done.
3. Update `docs/PROGRESS.md` (checklist + short "what we learned").
4. Commit to the `phase/<n>-<name>` branch (once branch is active).
5. **Stop and wait for human approval.** Never start the next phase automatically.

## 4. Architecture Pointers (`docs/ARCHITECTURE.md`)
- **Stack & Data Flow:** Sections 4–5
- **Pipeline, Math, HAB-LAB, DISPUTE, Receipts:** Section 6
- **Frontend, Store, 3D Scene, Panels:** Section 7
- **HELM Server, Tools, Validator, Featherless Limits:** Section 8
- **Contracts, Security, Directory Structure:** Sections 9–11
- **Phases, Acceptance & Freeze Checklist:** Sections 13–16

