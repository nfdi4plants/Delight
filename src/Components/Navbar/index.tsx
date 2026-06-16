import URLs from "../../Constants/URLs"

export default function Navbar() {
    return (
        <div className="navbar w-full bg-primary text-primary-content h-fit min-h-0 p-1">
            <div className="flex flex-1 items-center">
                <a className="text-sm font-bold italic px-2">delight</a>
                <a className="btn btn-sm btn-square ml-auto" href={URLs.GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                    <i className="iconify mdi--github size-6" data-icon="mdi:github">
                    </i>
                </a>
            </div>
        </div>
    )
}