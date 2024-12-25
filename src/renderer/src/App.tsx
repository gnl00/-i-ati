import HomeV2 from '@renderer/pages/Homev2'
import { ThemeProvider } from "@renderer/components/theme-provider"

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <HomeV2 />
    </ThemeProvider>
  )
}

export default App
