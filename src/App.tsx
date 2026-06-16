import { useContext } from 'react'
import './App.css'
import Layout from './Components/Layout'
import AuthenticateForm from './Components/AuthenticateForm'
import {TokenContext} from './Contexts/TokenContext'
import ArcBrowser from './Components/ArcBrowser'


function App() {
  const { token } = useContext(TokenContext)

  return (
      <Layout>
        {token === null ?
          <AuthenticateForm /> :
          <ArcBrowser />
        }
      </Layout>
  )
}

export default App
