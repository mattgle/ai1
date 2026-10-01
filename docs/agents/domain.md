# Project guidance

Use one shared context from the existing documents in `docs/superpowers/specs/`.
Start with `2026-09-21-ai1-design.md`. Read the specifications for the feature
under investigation and the related plans in `docs/superpowers/plans/`.

No separate `CONTEXT.md`, `CONTEXT-MAP.md`, or ADR directory exists at setup.
Do not invent domain rules or add duplicate documents to replace the existing
specifications. Read any future context or ADR files when their scope applies.

AI1 is a desktop IDE for a workspace with nested repositories. Preserve the
separation between the editor, Changes view, persistent terminals, agent service,
and isolated browser guests. Use the specifications for their detailed contracts.
