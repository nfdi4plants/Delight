import Navbar from '../Navbar'

export default function Layout ({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
            <Navbar />
            <div className="grow overflow-y-scroll">
                {children}
            </div>
        </div>
    )
}