import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tailwind.css'
import App from './App.tsx'
import TokenContextProvider from './Components/Provider/TokenContextProvider/index.tsx'
import ErrorContextProvider from './Components/Provider/ErrorContextProvider'
import NotesStateContextProvider from './Components/Provider/NotesStateContextProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorContextProvider>
      <TokenContextProvider>
        <NotesStateContextProvider>
          <App />
        </NotesStateContextProvider>
      </TokenContextProvider>
    </ErrorContextProvider>
  </StrictMode>,
)
