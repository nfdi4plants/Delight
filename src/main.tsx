import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tailwind.css'
import App from './App.tsx'
import TokenContextProvider from './Contexts/TokenContext'
import ErrorContextProvider from './Contexts/ErrorContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorContextProvider>
      <TokenContextProvider>
        <App />
      </TokenContextProvider>
    </ErrorContextProvider>
  </StrictMode>,
)
