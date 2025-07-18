/**
 * @import {RollupOptions} from 'rollup'
 */

import mdx from '@mdx-js/rollup'
import {babel} from '@rollup/plugin-babel'

/** @type {RollupOptions} */
const config = {
  // …
  plugins: [
    // …
    mdx({/* jsxImportSource: …, otherOptions… */}),
    // Babel is optional:
    babel({
      // Also run on what used to be `.mdx` (but is now JS):
      extensions: ['.js', '.jsx', '.cjs', '.mjs', '.md', '.mdx'],
      // Other options…
    })
  ]
}

export default config