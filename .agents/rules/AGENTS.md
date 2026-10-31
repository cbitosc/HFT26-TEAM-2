# Team Tetris Exoplanet Explorer — Agent Rules

See root `AGENTS.md` and `docs/ARCHITECTURE.md` for full specifications.

1. **Read First:** Always read `AGENTS.md`, `docs/PROGRESS.md`, and `docs/ARCHITECTURE.md` before making changes.
2. **Data Honesty:** Never invent, estimate, or zero-fill missing scientific values (`null` in data, grey `"unknown"` in UI). Every number requires a `Field` receipt (`<planetId>.<fieldName>`).
3. **Science Framing:** Never claim a planet is habitable or uninhabitable. Use `"habitable zone"` and `"potential habitability indicators"`. Label visuals `"Artist's impression"` and altered scales `"not to scale"`.
4. **Security:** Never read, print, log, or expose `FEATHERLESS_API_KEY` or `.env.local`.
5. **Scope & Dependencies:** Only `zustand`, `zod`, `d3-scale`, and `vitest` (dev) may be added. Log deviations in `docs/DECISIONS.md` and wait for human approval.
6. **File Ownership & Gates:** Only edit files owned by your role (`AGENTS.md` Section 2). Stop at the end of each phase gate and wait for human approval.

