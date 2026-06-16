import { useState } from 'react'
import useErrorContext from '../../Contexts/ErrorContext'
import usePageContext from '../../Contexts/PageContext'
import {validateToken} from '../../lib/services/git-service'
import {type GitlabToken} from '../../lib/domain/types'

export default function AuthenticateForm() {
    const [token, setToken] = useState('')
    const { setError } = useErrorContext()
    const { setToken: setGlobalToken } = usePageContext()

    const submit = async () => {
        const gitlabToken = token as GitlabToken
        const isValid = await validateToken(gitlabToken)
        if (isValid.success) {
            setGlobalToken(gitlabToken)
        } else {
            setError('Invalid token')
        }
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