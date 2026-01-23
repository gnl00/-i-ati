import HomeV2 from '@renderer/pages/HomeV2'
import { ThemeProvider } from './components/theme-provider'

import type { JSX } from "react";

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <HomeV2 />
    </ThemeProvider>
  )
}

export default App
