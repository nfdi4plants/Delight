import { TokenContext } from "../../../Contexts/TokenContext";
import { useLocalStorage } from "@uidotdev/usehooks";
import type { GitlabToken } from '../../../lib/domain/types'

export default function TokenContextProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useLocalStorage<GitlabToken | null>('delight-token-gitlab', null)

    return (
        <TokenContext value={{ token, setToken }}>
            {children}
        </TokenContext>
    )
}