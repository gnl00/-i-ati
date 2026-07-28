---
name: frontend-artifact
description: Load this when creating a runnable frontend artifact, standalone webpage, UI prototype, or interactive demo as real files, including React and Vite projects or static HTML presentations.
---

# Frontend Artifact

Create a runnable frontend deliverable in the workspace. Use real project files as the artifact boundary.

## Upfront Decisions

Choose these before implementation:

- project type: React with Vite or static HTML
- primary aesthetic direction
- one memorable design hook
- a level of complexity that fits the requested experience

Use React with Vite for interaction, state, animation, or component-driven work. Use static HTML for simple presentations. Preserve the existing stack when reshaping an established artifact.

## Build Workflow

1. Inspect the workspace, existing scaffold, dependencies, and supplied assets.
2. Establish the content hierarchy, interaction states, and responsive behavior.
3. Implement the complete experience as real files.
4. For npm projects, create `preview.sh` at the artifact root and make it launch the development server.
5. Run the relevant build or validation command, launch the preview, and inspect the rendered result at representative viewport sizes.

## Aesthetic Direction

- **Direction:** Choose a specific visual concept and carry it through every surface. Use one design hook to make the experience recognizable.
- **Typography:** Select a deliberate display and body type pairing. Establish clear hierarchy through size, weight, spacing, and line length.
- **Color:** Define a coherent palette with CSS variables. Favor low-saturation soft tones by default, and reserve large purple or blue gradients for concepts that explicitly call for them.
- **Motion:** Give each animation a purpose such as orientation, feedback, continuity, or emphasis. Keep timing and easing consistent with the interaction.
- **Layout:** Use composition to support hierarchy. Asymmetry, overlap, and grid breaks work when they strengthen the concept and preserve readability.

## Quality Bar

- Deliver complete interaction states and responsive layouts.
- Use accessible semantic structure, visible focus states, sufficient contrast, and reduced-motion handling.
- Keep the implementation proportional to the artifact's purpose.
- Report the generated path, preview entrypoint, and verification result.
