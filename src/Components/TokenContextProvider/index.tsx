import { TokenContext } from "../../Contexts/TokenContext";
import { useLocalStorage } from "@uidotdev/usehooks";

export default function TokenContextProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useLocalStorage<string | null>('delight-token-gitlab', null)

    return (
        <TokenContext value={{ token, setToken }}>
            {children}
        </TokenContext>
    )
}