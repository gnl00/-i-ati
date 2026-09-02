# ADR-0017: Emotion stimulus scoring and VAD state projection

- Status: Accepted
- Date: 2026-09-01
- Supersedes: [ADR-0005](0005-emotion-semantic-authority.md)
- Related decision: [ADR-0006](0006-app-level-emotion-state.md)
- Related architecture: [Emotion system design](../architecture/emotion-system-design.md)
- Related plan: [Emotion stimulus scoring implementation](../work/plans/emotion-stimulus-scoring-implementation.md)

## Context

`emotion_report` previously allowed the model to select a 13-label emotion,
rewrite intensity, and replace accumulated residue. Model output tends toward
positive presentation, which reduces the observable persistence of negative
user behavior across turns.

The application already owns an app-level singleton and a deterministic
finalization boundary. That boundary can combine a small behavior stimulus with
a persistent internal vector while keeping label, intensity, emoji, history,
and persistence under main-process control.

## Decision

`emotion_report` accepts one required signed integer for each behavior axis:

- `impact`: hostile or obstructive behavior to supportive or respectful behavior;
- `activation`: calming behavior to urgent, pressuring, or escalating behavior;
- `control`: destabilizing or confusing behavior to clear, autonomous, or actionable behavior.

Each field is constrained to `-2..2`. The processor returns only the normalized
stimulus confirmation. The model calls the tool once for each user turn and
uses `0/0/0` for neutral behavior. The reducer combines the stimulus with the app-level
VAD-like vector:

```text
next = baseline + retention * (previous - baseline) + gain * stimulus
```

The fixed baseline is `{ valence: 5, arousal: 3, dominance: 5 }`, retention is
`{ valence: 0.8, arousal: 0.5, dominance: 0.7 }`, and gain is `1`. Values are
clamped to `0..10` and close-to-baseline values snap to baseline.

The reducer projects the vector to the existing 13-label catalog using fixed
VAD centroids and weighted Euclidean distance. It derives presentation
`label + intensity + emoji` and writes that presentation to the assistant
message. The presentation source is `computed`; history records whether the
stimulus arrived from the tool or from omission-driven decay.

Tool omission is a runtime failure fallback that supplies zero stimulus and
moves the vector toward baseline.
Persisted v2 state contains `current` (vector plus the compatibility label and
intensity projection), fixed `baseline`, and bounded history. v1 rows migrate
deterministically by converting the legacy current label/intensity and history
through the shared centroids; legacy background and accumulated fields are
retired.

Stable scoring policy remains in `emotion_system`. Runtime state is injected in
`awake_state.emotion.current` and `awake_state.emotion.baseline`.

## Consequences

- Negative, urgent, calming, and supportive behavior can accumulate along
  separate axes.
- Model output has a small validated contract and no authority over final
  emotion semantics.
- Existing message, host, welcome, and header consumers keep label/intensity/
  emoji presentation fields.
- VAD centroids provide deterministic behavior with lower separability for
  guilt, shame, and sarcasm; fixtures document these boundaries.
- Legacy accumulated residue no longer has an independent rewrite path. Vector
  retention supplies the carry-over mechanism.

## Verification

- Focused reducer fixtures cover neutral/omitted decay, repeated hostility,
  respectful urgency, apology/support repair, and history bounds.
- Tool fixtures cover all integer and range boundaries and stateless responses.
- Mapper fixtures cover v2 round-trip, v1 migration, malformed data, and fixed
  baseline normalization.
- ChatStepStore and awake fixtures verify reducer presentation, singleton
  persistence, and model-visible current state.
