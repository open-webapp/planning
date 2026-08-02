import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/colors_and_type.css'
import './styles/styles.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
