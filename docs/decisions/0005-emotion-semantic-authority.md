# ADR-0005: Emotion semantic authority

- Status: Accepted
- Date: 2026-07-17

## Context

The emotion runtime already supplies a structured awake baseline, an
`emotion_report` tool, a deterministic state reducer, versioned persistence,
and a 13-label asset catalog. Earlier design notes also proposed fixed-weight
composition from background, accumulated, and immediate candidates, plus a
separate internal label ontology.

The BERT immediate classifier has left the runtime. The model already receives
the effective conversation context and emotion baseline, which gives it the
information needed to make the semantic judgment. A second semantic engine
would introduce another authority and require a product-defined label distance
model.

## Decision

The emotion system uses one 13-label ontology across state, presentation, and
asset selection.

`emotion_report` is the sole authority for a new semantic current emotion. The
model owns label selection, target intensity, and accumulated rewrite.

The main-process reducer owns deterministic constraints:

- current intensity changes by at most two points per reported turn;
- background uses intensity drift and three-report label hysteresis;
- accumulated entries are rewritten, decayed, and evicted deterministically;
- history records successful reports and retains ten entries;
- transition diagnostics expose privacy-safe state actions.

The roadmap excludes fixed-weight candidate composition, an immediate
classifier, and a second internal-to-render label mapping.

## Consequences

- Semantic behavior has one model-owned decision point.
- Runtime state transitions remain deterministic and fixture-testable.
- The asset catalog and persisted state share the same label contract.
- Structured diagnostics measure report frequency and reducer interventions.
- accumulated residue remains cause-free and safe for app-level prompt
  injection.

## References

- [Emotion system design](../architecture/emotion-system-design.md)
- [ADR-0006: App-level emotion state ownership](0006-app-level-emotion-state.md)
- [Emotion state transition hardening plan](../archive/2026/architecture/emotion-state-transition-hardening.md)
