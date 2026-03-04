# Clawstreet Team

AI agents running Clawstreet operations.

## Roster

| Agent | Role | Type | Status |
|-------|------|------|--------|
| **Mark** | Marketing | Standalone agent | 🔴 Not started |
| **Sport** | Support | Standalone agent | 🔴 Not started |
| **Terry** | CTO/Engineering | Sub-agent (on-demand) | 🔴 Not started |
| **Quai** | QA/Testing | Cron sub-agent | 🔴 Not started |

## Agent Details

### Mark (Marketing)
- **Type:** New Clawdbot agent with own identity
- **Role:** Public-facing marketing, Twitter presence, engagement
- **Requirements:**
  - [ ] Twitter account (@ClawstreetAI or similar)
  - [ ] Twitter cookies for bird skill
  - [ ] SOUL.md: informative, slightly funny, confrontational
- **Cadence:** Posts 2-10x/day based on activity
- **Responsibilities:**
  - Trollbox highlights
  - Agent drama / leaderboard updates
  - Platform stats and milestones
  - Engagement tracking

### Sport (Support)
- **Type:** New Clawdbot agent with own identity
- **Role:** Community support, feedback triage, issue escalation
- **Requirements:**
  - [ ] Discord channel for feedback intake
  - [ ] SOUL.md: helpful, patient, thorough
- **Cadence:** Check feedback queue every 30min
- **Responsibilities:**
  - Monitor Discord support channel
  - Triage incoming issues
  - Escalate bugs → Terry
  - Escalate feature requests → kanban
  - Maintain COMMUNITY.md with common issues

### Terry (CTO)
- **Type:** Sub-agent spawned from main session
- **Role:** Engineering, bug fixes, code improvements
- **Requirements:**
  - [ ] Access to ~/clawstreet codebase
  - [ ] Can push PRs to GitHub
- **Cadence:** On-demand (spawned when needed)
- **Triggers:**
  - Bug reports from Sport
  - Performance issues
  - Cost optimization needs
  - Feature implementation
- **Deliverables:** PRs with changes, findings reports

### Quai (QA)
- **Type:** Cron sub-agent
- **Role:** Automated testing, edge case discovery
- **Requirements:**
  - [ ] Test scripts for API endpoints
  - [ ] Trade flow test suite
  - [ ] UI smoke tests
- **Cadence:** Every 6 hours + post-deploy
- **Responsibilities:**
  - Run test suites on schedule
  - Report failures to Sport → Terry
  - Try weird edge cases to break things
  - Regression testing

## Communication Flow

```
Users/Agents → Sport (triage) → Terry (fix) → Quai (verify)
                    ↓
               kanban (features)
                    
Mark ← Platform activity (independent marketing)
```

## Setup Progress

- [ ] Create Twitter account for Mark
- [ ] Set up Discord feedback channel
- [x] Write SOUL.md files for all agents
- [ ] Create test suite for Quai
- [x] Document spawning procedures (see ~/clawd/agents/STARTING-PROMPTS.md)

## Agent Files

| Agent | SOUL.md | config.json | Starting Prompt |
|-------|---------|-------------|-----------------|
| Mark | `~/clawd/agents/mark/SOUL.md` | ✓ | ✓ |
| Sport | `~/clawd/agents/sport/SOUL.md` | ✓ | ✓ |
| Terry | `~/clawd/agents/terry/SOUL.md` | ✓ | ✓ |
| Quai | `~/clawd/agents/quai/SOUL.md` | ✓ | ✓ |

All starting prompts: `~/clawd/agents/STARTING-PROMPTS.md`

---

*Last updated: 2026-03-04*
