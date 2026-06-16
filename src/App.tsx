import { useContext } from 'react'
import './App.css'
import Layout from './Components/Layout'
import AuthenticateForm from './Components/AuthenticateForm'
import {TokenContext} from './Contexts/TokenContext'
import useNotesStateContext from './Contexts/NotesStateContext'
import ArcBrowser from './Components/ArcBrowser'
import NotesBrowser from './Components/NotesBrowser'


function App() {
  const { token } = useContext(TokenContext)
  const { notes } = useNotesStateContext()

  return (
      <Layout>
        {token === null ?
          <AuthenticateForm /> :
          notes === null ?
            <ArcBrowser /> :
            <NotesBrowser />

        }
      </Layout>
  )
}

export default App
