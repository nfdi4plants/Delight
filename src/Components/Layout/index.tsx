import { useEffect, useState } from 'react'
import Navbar from '../Navbar'
import Title from '../Title'
import usePageContext from '../../Contexts/PageContext'
import useTokenContext from '../../Contexts/TokenContext'
import { getCurrentUser } from '../../lib/services/git-service'
import type { GitlabUser } from '../../lib/domain/types'

const ISSUES_URL = 'https://github.com/nfdi4plants/Delight/issues'

function ReportIssueButton() {
    return (
        <a
            className="btn btn-sm btn-outline w-full"
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
        >
            <i className="iconify mdi--bug-outline size-4" data-icon="mdi:bug-outline"></i>
            Report an issue
        </a>
    )
}

function CurrentUser() {
    const { token } = useTokenContext()
    const [user, setUser] = useState<GitlabUser | null>(null)

    useEffect(() => {
        if (token === null) {
            setUser(null)
            return
        }
        let cancelled = false
        getCurrentUser(token).then((result) => {
            if (!cancelled && result.success) {
                setUser(result.value)
            }
        })
        return () => {
            cancelled = true
        }
    }, [token])

    if (user === null) return null

    return (
        <div className="text-sm text-base-content/70">
            Logged in as <span className="font-semibold text-base-content">{user.name}</span> (@{user.username})
        </div>
    )
}

function LogoutButton() {
    const { logout } = usePageContext()

    const handleLogout = () => {
        logout()
        // close the drawer if it's open
        const drawer = document.getElementById("app-drawer") as HTMLInputElement | null;
        if (drawer && drawer.checked) {
            drawer.checked = false;
        }
    }
    return (
        <button className="btn btn-sm btn-outline btn-error" onClick={handleLogout}>Logout</button>
    )
}

export default function Layout ({ children }: { children: React.ReactNode }) {
    const drawerId = "app-drawer"
    return (
        <div className="drawer w-full h-full">
            <input id={drawerId} type="checkbox" className="drawer-toggle" />
            <div className="drawer-content h-screen w-screen flex flex-col overflow-hidden">
                <Navbar drawerId={drawerId} />
                <div className="grow overflow-hidden">
                    {children}
                </div>
            </div>
            <div className="drawer-side">
                <label htmlFor={drawerId} aria-label="close sidebar" className="drawer-overlay"></label>
                <div className="bg-base-200 min-h-full w-80 p-4">
                    <div className="flex flex-row items-center mb-2">
                        <Title />
                        <label htmlFor={drawerId} className='z-1 btn btn-sm btn-circle btn-accent ml-auto'>
                            <i className="iconify mdi--close size-6" data-icon="mdi:close"></i>
                        </label>
                    </div>
                    <div className="flex flex-col gap-3">
                        <CurrentUser />
                        <LogoutButton />
                        <div className="divider my-0"></div>
                        <ReportIssueButton />
                    </div>
                </div>
            </div>
        </div>
    )
}
