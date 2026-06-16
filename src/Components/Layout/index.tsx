import Navbar from '../Navbar'
import useTokenContext from '../../Contexts/TokenContext'
import useNotesStateContext from '../../Contexts/NotesStateContext'
import Title from '../Title'

function LogoutButton() {
    const { setToken } = useTokenContext()
    const { setNotes } = useNotesStateContext()

    const handleLogout = () => {
        setNotes(null)
        setToken(null)
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
                <div className="grow overflow-y-scroll">
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
                    <LogoutButton />
                </div>
            </div>
        </div>
    )
}