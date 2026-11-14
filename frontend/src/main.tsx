import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import './index.css'
import App from './App.tsx'

const theme = createTheme({
  primaryColor: 'coffee',
  colors: {
    // Baho's brand palette: warm roast-brown primary, matching the
    // existing Power BI reports' orange accent bars.
    coffee: [
      '#fbf3ee', '#f1ddd0', '#e4bda2', '#d79b72', '#cc7d4a',
      '#c4682f', '#a8502a', '#8a4b2e', '#6e3a24', '#532a1a',
    ],
  },
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
