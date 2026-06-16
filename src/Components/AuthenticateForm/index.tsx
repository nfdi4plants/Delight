import React from 'react'
import { useState } from 'react'
import { TokenContext } from '../../Contexts/TokenContext'

export default function AuthenticateForm() {
    const [token, setToken] = useState('')
    let { setToken: setGlobalToken } = React.useContext(TokenContext)

    const submit = () => {
        setGlobalToken(token)
    }

    return (
        <div className="hero h-full">
            <div className="hero-content flex-col gap-8">
                <h1 className="text-5xl font-bold">Authenticate</h1>
                <div className="text-2xl text-base-content/70">Enter your token to authenticate</div>
                <input 
                    name="token"
                    type="password" 
                    className="input input-xl"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            submit()
                        }
                    }} 
                    onChange={(e) => setToken(e.target.value)} />
                <button className="btn btn-primary btn-lg" onClick={submit}>Authenticate</button>
            </div>
        </div>
    )
}