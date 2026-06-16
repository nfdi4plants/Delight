import { useContext } from 'react'
import './App.css'
import AuthenticateForm from './Components/AuthenticateForm'
import {TokenContext} from './Contexts/TokenContext'


function App() {
  const { token } = useContext(TokenContext)

  return (
      <div className="h-screen w-screen">
        {token === null && <AuthenticateForm />}
      </div>
  )
}

export default App
