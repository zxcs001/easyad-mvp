# ADR 0007: Status colour encoding

- Date: 2026-09-10
- Status: Accepted; the tokens are applied in `app/globals.css`
- Authority: User request to research and apply the best colour scheme
- Scope: Colour tokens and status encoding, not typography, layout, motion, or component structure

## Context

The creative north star in [DESIGN.md](../../DESIGN.md) is a municipal operations room with clear status lamps. A status lamp must communicate one state at a glance.

An audit measured the previous tokens. Every number below is computed, not estimated. Contrast follows the WCAG 2.x relative luminance formula. Colour-vision deficiency uses the Brettel-Vienot LMS transform.

The audit found four defects.

1. The success token and the danger token were separated by hue only. Both held nearly the same lightness. A person with protanopia saw `#187a5c` as `#70705c` and saw `#b84f3f` as `#6b6b3e`. The separation was 1.10:1, where 1.00:1 means identical. About 8% of men have a red-green colour deficiency.
2. `--gold #c29534` gave 2.75:1 on a panel. WCAG 1.4.3 needs 4.5:1. `--coral #d65f46` gave 3.76:1, which permits large text only.
3. Two palettes existed. `app/globals.css` defined `--green`, `--blue`, `--coral` and `--gold` at the root, then defined `--workspace-green`, `--workspace-blue`, `--workspace-amber` and `--workspace-danger` lower down. The [DESIGN.md](../../DESIGN.md) front matter documented a third mix of the two. This state contradicted the existing rule to never add a second token palette.
4. `--line #e4e8ea` gave 1.23:1. WCAG 1.4.11 needs 3:1 for the edge of a control.

Defect 2 carries legal weight. Ontario Regulation 191/11 under the AODA requires WCAG 2.0 Level AA for the Ontario public sector. The seeded buyers are a municipality and a university. Both are designated public-sector organizations.

## Decision

### Severity is encoded by visual weight, not by hue

A colour-vision deficiency removes a hue channel. It never removes lightness. Therefore each state gets a different visual weight.

| Weight | State | Surface | Ink | Contrast |
|---|---|---|---|---|
| 0 | Idle, unpublished | `#eef1f3` | `#5b6770` | 5.12:1 |
| 1 | Published, healthy | `#e3f2ea` | `#14503c` | 8.10:1 |
| 2 | Reversible caution | `#fbeab4` | `#7a5510` | 5.59:1 |
| 3 | Destructive or failed | `#b3192e` | `#ffffff` | 6.78:1 |
| 4 | Active screen override | `#1a1206` | `#ffc845` | 12.00:1 |

This ladder holds every operationally critical pair above 3:1 under protanopia, deuteranopia and tritanopia. The published-to-revoked pair improves from 1.38:1 to 4.57:1 under deuteranopia.

### A search of the colour space shows that no pair of inks solves this

The audit searched the green and red hue bands for a better ink pair. Both inks had to keep 4.5:1 on white. The best pair reached 3.15:1, and it required a red so dark that it read as black. An ink pair therefore cannot solve this problem. A surface-and-ink pair can, because it can differ in lightness.

### Colour alone never encodes a state

Four pale states measure 1.00:1 apart under deuteranopia. No palette separates them. Each state must therefore also carry an icon shape and a text label. [DESIGN.md](../../DESIGN.md) previously gave this as guidance for warning and error states. It is now a rule, and it covers every state, including the healthy one.

### The emergency composition stays amber on near-black

`#ffc845` on `#1a1206` separates from every routine state by more than 15:1. Those routine states are the states an override actually appears beside.

The alternative was black ink on a bright amber surface. That option separates better from the danger red, at 3.67:1 instead of 2.30:1, but it falls to 1.25:1 against the pale routine states. The chosen option is correct because an override banner and a destructive confirmation button never appear as peers in one list.

### The duplicate palette is folded, not deleted

The `--workspace-*` names remain, because about 50 call sites use them. Each name now resolves to the one palette through `var()`. One source of truth exists, and no call site changed.

### The civic green identity does not change

`--green #1f7a5a` and `--green-dark #14503c` are kept. The audit found no defect in them. Brand continuity was preferred over a change without cause.

## Consequences

- `--gold` and `--coral` are removed. Five call sites now use `--state-warning-ink` or `--state-danger`.
- `--line-strong #767f86` is added. It gives 4.08:1 on a panel and 3.73:1 on the application background, so a control edge can meet WCAG 1.4.11. `--line` remains for a decorative hairline and must never bound a control.
- `--workspace-line-strong` changes from `#ccd4d8`, which gave 1.28:1, to `--line-strong`.
- `--danger` moves to `#b3192e`, which equals the Government of Canada danger token.
- Low-alpha decorative gradients still name old hex values, for example `#187a5c1f`. They carry no state and remain open work.
- The application is light-theme only, so no dark-theme values are defined.

## Alternatives that were rejected

- **Keep hue encoding and add an icon.** An icon alone leaves the lamp itself unreadable. The lamp is the signature of the product.
- **Adopt the Ontario Design System status colours directly.** Its warning `#FFD440` is a box surface with black text, not an ink. Its structure was adopted; its exact values were not, because they do not match the civic green identity.
- **Move the primary to blue for civic trust.** This change would discard a working brand identity and fix no measured defect.

## References

- [Ontario Design System, colours](https://designsystem.ontario.ca/components/detail/colours.html)
- [GC Design System, colour tokens published with contrast ratios](https://design-system.canada.ca/en/styles/colour)
- [USWDS state tokens, which keep a distinct emergency token](https://designsystem.digital.gov/design-tokens/color/state-tokens/)
- [Ontario, how to make websites accessible, O. Reg. 191/11](https://www.ontario.ca/page/how-make-websites-accessible)
