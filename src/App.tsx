import './App.css'
import Layout from './Components/Layout'
import usePageContext from './Contexts/PageContext'
import React from 'react'

// lazy imports
const LazyAuthenticateForm = React.lazy(() => import('./Components/AuthenticateForm'))
const LazyArcBrowser = React.lazy(() => import('./Components/ArcBrowser'))
const LazyNotesBrowser = React.lazy(() => import('./Components/NotesBrowser'))

function App() {
  const { page } = usePageContext();

  return (
      <Layout>
        <React.Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full">
            <span className="loading"></span>
          </div>
        }>
          {
            page === "authentication" ? <LazyAuthenticateForm /> :
            page === "arc-browser" ? <LazyArcBrowser /> :
            page === "notes-browser" ? <LazyNotesBrowser /> :
            <div className="flex flex-col items-center justify-center h-full">
              <h1 className="text-2xl font-bold">Page not found</h1>
            </div>
          }
        </React.Suspense>
      </Layout>
  )
}

export default App
