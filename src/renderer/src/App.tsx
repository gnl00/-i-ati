import HomeV2 from '@renderer/pages/HomeV2'
import { ThemeProvider } from './components/theme-provider'

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <HomeV2 />
    </ThemeProvider>
  )
}

export default App
