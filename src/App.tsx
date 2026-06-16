import './App.css'
import Layout from './Components/Layout'
import AuthenticateForm from './Components/AuthenticateForm'
import usePageContext from './Contexts/PageContext'
import ArcBrowser from './Components/ArcBrowser'
import NotesBrowser from './Components/NotesBrowser'


function App() {
  const { page } = usePageContext();

  return (
      <Layout>
        {
          page === "authentication" ? <AuthenticateForm /> :
          page === "arc-browser" ? <ArcBrowser /> :
          page === "notes-browser" ? <NotesBrowser /> :
          <div className="flex flex-col items-center justify-center h-full">
            <h1 className="text-2xl font-bold">Page not found</h1>
          </div>
        }
      </Layout>
  )
}

export default App
