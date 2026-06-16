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
          page.type === "authentication" ? <AuthenticateForm /> :
          page.type === "arc-browser" ? <ArcBrowser /> :
          page.type === "notes-browser" ? <NotesBrowser /> :
          null
        }
      </Layout>
  )
}

export default App
