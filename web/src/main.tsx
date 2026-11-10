import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted IBM Plex Sans (Carbon's standard typeface) — the weights Carbon's
// type styles use: 300 light, 400 regular, 600 semibold.
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import './styles/index.scss'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
