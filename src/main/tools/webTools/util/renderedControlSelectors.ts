// Recognized documentation controls, shared by readiness and Markdown extraction.
// Keep native button/parent constraints so matching prose and source stay intact.
export const RENDERED_CONTROL_NOISE_SELECTOR = [
  'button.copybutton',
  'button[aria-label="Copy code to clipboard"]',
  'div[class*="language-"] > button.copy[data-copied]',
  '.theme-doc-toc-mobile > button[class*="tocCollapsibleButton_"]'
].join(', ')
