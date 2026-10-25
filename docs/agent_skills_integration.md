# Agent Skills Specification & Integration

GitStress conforms to the [Agent Skills](https://agentskills.io) specification (pioneered by Vercel Labs and open-source agent tooling). Skills enable AI coding agents (such as Claude Code, Cursor, Codex, Antigravity, and GitHub Copilot) to discover, activate, and execute expert workflows autonomously.

---

## 1. Directory Structure

Skills are located within `.agents/skills/`:

```
.agents/
├── AGENTS.md                  # Project rules and architectural guidelines
└── skills/
    ├── gitstress/             # Concurrency diagnostic & triage skill
    │   └── SKILL.md
    ├── council/               # 5-person multi-perspective decision advisory council
    │   └── SKILL.md
    ├── react-best-practices/  # 70+ performance rules from Vercel Engineering
    │   ├── SKILL.md
    │   ├── rules/
    │   └── metadata.json
    ├── web-design-guidelines/ # Accessibility, focus rings, and layout-shift checks
    │   └── SKILL.md
    ├── writing-guidelines/    # Active voice, brevity, and engineering prose rules
    │   └── SKILL.md
    ├── react-view-transitions/# Spatial view transition recipes and patterns
    │   ├── SKILL.md
    │   └── references/
    ├── composition-patterns/  # Scalable compound component patterns
    │   ├── SKILL.md
    │   └── rules/
    └── vercel-optimize/       # Observability-first Vercel performance audits
        ├── SKILL.md
        ├── scripts/
        └── references/
```

---

## 2. Universal Discovery (`skills.sh.json`)

GitStress defines [`skills.sh.json`](file:///c:/Users/tesse/Desktop/gitstress/skills.sh.json) at the repository root to enable discovery via `skills.sh`:

```json
{
  "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
  "notGrouped": "bottom",
  "groupings": [
    {
      "title": "GitStress Diagnostics",
      "description": "Skills for identifying backend bottlenecks, calculating concurrency limits, and verifying load headroom.",
      "skills": ["gitstress", "council"]
    },
    {
      "title": "Engineering Best Practices",
      "description": "Production performance and composition standards from Vercel Labs.",
      "skills": [
        "react-best-practices",
        "composition-patterns",
        "react-view-transitions",
        "web-design-guidelines",
        "writing-guidelines"
      ]
    }
  ]
}
```

---

## 3. The `gitstress` Agent Skill

Any AI coding agent installed with the `gitstress` skill can execute:

* `npx gitstress audit <url>`: Pinpoint the first failing symbol and line number under load.
* Concurrency Headroom Delta: Generate automated PR review comments with before/after concurrency metrics.
* Remediation: Synthesize verified high-concurrency patches (e.g. connection pool tuning, buffered channels, bulk queries).
