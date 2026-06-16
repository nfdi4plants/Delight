import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tailwind.css'
import App from './App.tsx'
import TokenContextProvider from './Components/TokenContextProvider'
import ErrorContextProvider from './Components/ErrorContextProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorContextProvider>
      <TokenContextProvider>
        <App />
      </TokenContextProvider>
    </ErrorContextProvider>
  </StrictMode>,
)
