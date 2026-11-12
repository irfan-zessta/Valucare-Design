import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted IBM Plex Sans (the brand typeface) — weights used by the theme:
// 300 light, 400 regular, 500 medium, 600 semibold.
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './styles/app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
