# ADR-0046: Conditional tool availability

**Status:** Accepted<br>
**Date:** 2026-10-15<br>
**Related:** [Tool definition workflow](../guides/development/tool-definition-workflow.md)

## Context

Chat preparation excluded emotion and interactive-question tools with tool-name
branches. Image analysis remained exposed even when the user had not configured
`config.tools.visionModel`. Adding further branches spreads tool prerequisites
across the request factory rather than declaring them alongside each tool.

## Decision

- Declare positive prerequisites in shared embedded metadata as `requires`.
  Fixed typed keys cover emotion, vision analysis, and interactive input.
  All declared prerequisites must hold; no declaration means no restriction.
- Compute condition facts from the current configuration and message source in
  `RunRequestFactory`. Vision injection checks only whether
  `config.tools?.visionModel` is non-empty. An empty slot excludes `image_analyze`
  even if other vision-capable models are available. The execution path also
  checks this slot first and returns a configuration hint when empty. It validates
  only the explicit vision reference and never falls back to another model.
- Filter built-in and same-name extra tools centrally in `ToolListBuilder` using
  shared embedded metadata. Keep explicit name exclusions available. Extra tools
  without embedded metadata retain their existing behavior.
- Keep metadata outside model-facing definitions. Log tool names and unmet
  prerequisite keys for diagnosis, without configuration or credentials.
- Preserve the run's emotion snapshot for prompts, Awake context, and settlement.
  Image context retains attachment refs but explains unavailability instead of
  instructing the model to call a hidden image-analysis tool.
- Retain existing execution validation and settlement guards. Availability is a
  request-composition decision, not a promise of network success or authorization.

## Consequences

New prerequisites require a typed key and a fact computed during preparation;
there is no expression language, callback registry, user configuration, or schema
migration. Runtime configuration changes can make a previously exposed tool
unavailable, so execution checks remain necessary. This decision applies to the
chat request builder; subagent role policies and maintenance tool lists keep their
existing ownership.
