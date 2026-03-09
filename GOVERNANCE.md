# Hermes IDE — Governance

Hermes IDE follows a **BDFL (Benevolent Dictator For Life)** governance model. The creator has final say on all decisions: roadmap, features, releases, licensing, and community policy.

## Roles

| Role | Permissions & Responsibilities |
|------|-------------------------------|
| **Owner (BDFL)** | Final say on all decisions. Merge to main. Release authority. Can override any maintainer decision. Sets vision, reviews proposals, approves features. |
| **Maintainer** | Merge PRs in assigned areas. Triage issues. Close issues/PRs that don't fit. Review PRs for quality. Enforce guidelines. Escalate to BDFL when in doubt. |
| **Contributor** | Submit PRs. Open issues. Participate in discussions. Follow guidelines. Sign CLA. Respond to reviews. |
| **Community Member** | Open issues. Comment. Test pre-releases. Report bugs. Respect Code of Conduct. |

## Decision-Making

- **Routine changes** (bug fixes, dependency updates, minor UX): Lazy consensus — state intent, wait 72 hours, proceed if no objections from maintainers.
- **Significant features or architecture changes**: Lightweight RFC — written proposal in GitHub Discussions, BDFL makes the final call.
- **Core philosophy decisions**: BDFL veto — absolute right to reject any proposal conflicting with [Design Principles](DESIGN_PRINCIPLES.md), regardless of community sentiment.

## Disagreement Resolution

1. **Contributor vs. Maintainer**: escalate to BDFL.
2. **Community vs. BDFL**: BDFL explains reasoning publicly, decision stands.
3. Significant rejections are logged in a pinned discussion to prevent relitigating the same debates.

## Maintainer Selection

- Promoted from active, quality contributors.
- Requires BDFL approval.
- Can be revoked if inactive (>3 months) or in violation of the Code of Conduct.
