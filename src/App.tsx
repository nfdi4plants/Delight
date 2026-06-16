import { useContext } from 'react'
import './App.css'
import Layout from './Components/Layout'
import AuthenticateForm from './Components/AuthenticateForm'
import {TokenContext} from './Contexts/TokenContext'
import {ErrorContext} from './Contexts/ErrorContext'


function App() {
  const { token } = useContext(TokenContext)

  return (
      <Layout>
        {token === null && <AuthenticateForm />}
      </Layout>
  )
}

export default App
