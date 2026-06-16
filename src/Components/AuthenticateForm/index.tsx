import { useState } from 'react'
import useErrorContext from '../../Contexts/ErrorContext'
import usePageContext from '../../Contexts/PageContext'
import {validateToken} from '../../lib/services/git-service'
import {type GitlabToken} from '../../lib/domain/types'
import { BASE_URL } from '../../lib/services/git-service'

// let prefillGitLabPATScopes (gitlabBaseUrl: string) =
//         let gitlabBaseUrl = gitlabBaseUrl.TrimEnd('/')

//         let scopes = [
//             "read_user"
//             "read_repository"
//             "read_api"
//             "api"
//             "write_repository"
//             "self_rotate" // This is used to allow users to rotate their token from within Swate without having to log in to GitLab. It is a scope that only allows the token itself to be revoked, not any other tokens or account access.
//         ]

//         let scopeParam = scopes |> String.concat ","

//         let description =
//             "Swate Electron App. Gives access to your repositories and allows Swate to read your user information. This is used to authenticate you and access your ARCs. You can revoke this token at any time without affecting any other tokens or your account."
//                 .Replace(" ", "%20")

//         sprintf
//             "%s/-/user_settings/personal_access_tokens?name=swate-electron&description=%s&scopes=%s"
//             gitlabBaseUrl
//             description
//             scopeParam

function GitlabTokenScopeLink() {
    const gitlabBaseUrl = BASE_URL
    const scopes = [
        "read_user",
        "read_repository",
        "read_api",
        "api",
        "write_repository",
    ]
    const scopeParam = scopes.join(",")
    const description =
        "Delight Web App. Gives access to your repositories and allows Delight to read your user information. This is used to authenticate you and access your ARCs to sync notes. You can revoke this token at any time."
    const url = `${gitlabBaseUrl}/-/user_settings/personal_access_tokens?name=delight-web-app&description=${encodeURIComponent(description)}&scopes=${scopeParam}`
    
    return (
        <a className="link link-accent" href={url} target="_blank" rel="noopener noreferrer">
            Generate a GitLab Personal Access Token
        </a>
    );
}

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
                <p className="text-error text-sm max-w-md text-center">This is a prototype! Your token will not be stored securely. Remember to logout when you're done.</p>
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
                <GitlabTokenScopeLink />
                <button className="btn btn-primary btn-lg" onClick={submit}>Authenticate</button>
            </div>
        </div>
    )
}