import URLs from "../../Constants/URLs"
import Title from "../Title"

export default function Navbar({ drawerId }: { drawerId: string }) {
    return (
        <div className="navbar w-full bg-primary text-primary-content h-fit min-h-fit p-1">
            <div className="flex flex-1 items-center">
                <Title className="px-2" />
                <a className="btn btn-sm btn-square ml-auto" href={URLs.GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                    <i className="iconify mdi--github size-6" data-icon="mdi:github">
                    </i>
                </a>
                <label htmlFor={drawerId} className="btn btn-sm btn-square ml-2">
                    <i className="iconify mdi--menu size-6" data-icon="mdi:menu"></i>
                </label>
            </div>
        </div>
    )
}