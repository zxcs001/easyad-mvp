# ADR 0008: Advertiser complexity modes

- Date: 2026-09-11
- Status: Accepted as a decision record; not implemented. Stage 1 is the next buildable step.
- Authority: Austin proposed a complexity switch; the user asked to record the decision before anyone builds it
- Scope: Complexity disclosure in the advertiser workspace. This ADR explicitly does not apply to the operator, institution, or government consoles.

## Context

[ADR 0007](0007-status-colour-encoding.md) and the advertiser plain-language work split vocabulary by **role**. Role is the only complexity axis the product has today.

Role is not enough. The seeded advertisers are three different kinds of buyer inside one role.

| Stable ID | Who they are | What they need |
|---|---|---|
| `USR-DEMO-ADV-01` | Northline Fitness Marketing | A single gym buying one local screen |
| `USR-DEMO-ADV-02` | Atlas Grocery Campaign Team | An in-house marketing team running several stores |
| `USR-DEMO-ADV-03` | North Shore Media Buying | A professional agency buying for clients |

A shop owner and a media buyer open the same screens and want opposite things. The shop owner wants two decisions. The agency wants every control at once.

The product already half-recognizes this. `agency_workspace` exists in [`app/lib/feature-flags.ts`](../../app/lib/feature-flags.ts), and PD-005 in [Product Decisions](../PRODUCT_DECISIONS.md) treats an agency as a distinct actor with its own authority. Neither mechanism changes interface density.

## Decision

### Two modes, never three

A person cannot place themselves on a three-point scale about software they have not used. Nobody self-identifies as intermediate.

Three modes also force a three-way decision for every control that is built. The middle tier becomes the place where undecided controls are parked. The product ships two modes or none.

### Guided is the default

The people who most need the simpler mode do not know they need it. They will not open a settings page to declare themselves beginners.

Therefore the default is the real decision, and the switch only serves the minority who opt out. The default is **guided**.

A default of full control, chosen so that nobody feels patronized, makes the entire feature useless. That outcome is not acceptable.

### Modes are named after the job, not the person's skill

A mode named for skill invites a person to choose by pride rather than by need. That person then reports the product as confusing.

| Rejected | Accepted |
|---|---|
| Basic / Expert | Guided / Full control |
| Beginner / Advanced | Walk me through it / Show everything |

### The mode is reached per decision before it is ever global

The escape hatch belongs inside each step of the buying flow, not in a settings page. A per-step control that reveals the remaining options gives the same benefit with a local blast radius.

A global switch is added only if people still ask for one after the per-step control ships.

### Preference is remembered, not asked for

When a person opens the additional controls, the interface remembers that choice and opens them next time. A mode that is earned from behavior never has to be discovered.

[`app/lib/preferences.ts`](../../app/lib/preferences.ts) already stores a durable interface preference in a cookie for the intro screen. The mode reuses that mechanism. No new persistence layer is introduced.

## The boundary that must not move

**A complexity mode must never apply to the operator console, the institution console, or the government console.**

A municipal operator in a simplified interface during an AMBER, evacuation, or public-safety override is a safety problem. [DESIGN.md](../../DESIGN.md) already forbids hiding permission limits, publish uncertainty, or alert scope. A complexity mode is a mechanism for hiding controls, so it is forbidden on those surfaces by the same rule.

This boundary is not a default. No configuration value, feature flag, or account setting may enable a complexity mode on an emergency override path.

## Staging

1. **Persistent disclosure.** Default the advertiser filters and option groups to closed. Remember what a person opens. No switch, no mode, no new component. This is the next buildable step.
2. **Per-step escape hatch.** When `CampaignStepper` is built, each step carries one control that reveals the remaining options for that step only.
3. **Global switch.** Two settings, defaulted to guided, advertiser workspace only. Built only if stage 1 and stage 2 leave a demonstrated need.

Each stage is useful alone. Stopping after stage 1 or stage 2 is an acceptable outcome.

## Consequences

- Verification cost rises with each mode. The canonical UI map in [UX-CONTRACT.md](../../UX-CONTRACT.md) requires verification per capability, and a second mode roughly doubles that matrix on every advertiser screen, in English and French. Staging exists to delay that cost until it is earned.
- Stage 1 and stage 2 add no mode to the interface, so they add no matrix.
- A control that exists only behind the disclosure is a control a guided person never learns about. Anything a first-time buyer must know stays visible in guided mode. Disclosure hides detail, never capability.
- When `CampaignStepper` is specified, its contract row must record the per-step disclosure and its keyboard behavior.

## Alternatives that were rejected

- **Three modes.** The middle tier cannot be defined, cannot be self-selected, and collects undecided controls.
- **A global switch first.** It is a settings answer to an information-architecture question. It lets the team ship two versions of a screen instead of agreeing which controls matter, and the unresolved controls then live in the advanced mode permanently.
- **Mode by account type alone.** An agency seat and a shop owner seat do differ, but a single shop owner grows into a confident buyer within one account. Behavior is a better signal than account type.
- **Asking on first run.** A person cannot answer a question about density before seeing the product. It also adds a screen between the person and their first task.
