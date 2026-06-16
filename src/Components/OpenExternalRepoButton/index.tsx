import { type Repository } from "../../lib/domain/types";

type OpenExternalRepoButtonProps = {
    repository: Repository;
    className?: {
        btn?: string;
        icon?: string;
    }
}

export default function OpenExternalRepoButton({repository, className}: OpenExternalRepoButtonProps) {
    const btnClassName = className?.btn || ""
    const iconClassName = className?.icon || ""
    
    return (
        <a
            className={`btn btn-ghost btn-square ${btnClassName}`}
            href={repository.web_url}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            rel="noopener noreferrer"
        >
            <i className={`iconify mdi--open-in-new ${iconClassName}`}></i>
        </a>
    )

}