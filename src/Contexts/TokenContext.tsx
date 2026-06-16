import {createContext} from 'react'
import { useLocalStorage } from "@uidotdev/usehooks";

type TokenContextType = {
    token: string | null
    setToken: (token: string | null) => void
}

export const TokenContext = createContext<TokenContextType>({
    token: null,
    setToken: () => {},
})

export default function TokenContextProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useLocalStorage<string | null>('token', null)

    return (
        <TokenContext value={{ token, setToken }}>
            {children}
        </TokenContext>
    )
}