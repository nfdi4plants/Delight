import {createContext, useContext} from 'react'
import type { GitlabToken } from '../lib/domain/types'

type TokenContextType = {
    token: GitlabToken | null
    setToken: (token: GitlabToken | null) => void
}

export const TokenContext = createContext<TokenContextType>({
    token: null,
    setToken: () => {},
})

export const useTokenContext = () => useContext(TokenContext)

export default useTokenContext