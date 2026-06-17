
import React from "react";
import * as gitlabApi from "../../lib/services/git-service";
import useTokenContext from "../../Contexts/TokenContext";
import { type GitlabToken } from "../../lib/domain/types";
import { useErrorContext } from "../../Contexts/ErrorContext";
import { type Repository } from "../../lib/domain/types";
import BaseModal from "../BaseModal";
import usePageContext from "../../Contexts/PageContext";
import OpenExternalRepoButton from "../OpenExternalRepoButton";

interface ArcBrowserListItemProps {
    repository: Repository;
}

function Avatar({url, letter}: {url: string | null, letter?: string}) {
    if (!url) {
        return <div className="size-10 rounded-box bg-base-300 flex items-center justify-center">
            <p className="uppercase text-lg">{letter}</p>
        </div>
    }
    return <img className="size-10 rounded-box" src={url || undefined} />
}

function ArcBrowserListItem({ repository }: ArcBrowserListItemProps) {
    const { name, description, avatar_url } = repository;
    const {setRepository} = usePageContext()

    const connect = async () => {
        setRepository(repository)
    }
    return (
        <li 
            className="list-row cursor-pointer hover:bg-base-200"
            onClick={connect}
        >
            <div>
                <Avatar url={avatar_url} letter={name[0]} />
            </div>
            <div>
            <div>{name}</div>
            <div className="text-xs uppercase font-semibold opacity-60">{description}</div>
            </div>
            {/* <button className="btn btn-square btn-accent" onClick={connect}>
                <i className="iconify mdi--link-variant size-8"/>
            </button> */}
            <OpenExternalRepoButton repository={repository} className={{icon: "size-5!"}} />
        </li>
    )
}

function LoadingSpinner() {
    return (
        <div className="flex justify-center py-8">
            <div className="loading loading-bars text-accent loading-xl"></div>
        </div>
    )
}

function EmptyView() {
    return (
        <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-2xl opacity-60">No ARCs found</div>
            <div className="text-sm opacity-40">Connect a repository to get started</div>
        </div>
    )
}

function ArcBrowserList({repos}: {repos: Repository[]}) {

    return (
        <ul className="list grow max-w-md mx-auto overflow-y-auto pb-48">
    
            <li className="p-4 pb-2 text-xs opacity-60 tracking-wide">Your ARCs</li>
            
            {repos.map(repo => <ArcBrowserListItem key={repo.id} repository={repo} />)} 
        </ul>
    )
}

function CreateArcModal({isOpen, setIsOpen}: {isOpen: boolean, setIsOpen: (isOpen: boolean) => void}) {
    const [input, setInput] = React.useState("")
    const {token} = useTokenContext()
    const {setError} = useErrorContext()
    const {setRepository} = usePageContext()
    const [isCreating, setIsCreating] = React.useState(false)

    const createArc = async () => {
        setIsCreating(true)
        const repository = await gitlabApi.createRepo(token as GitlabToken, input)
        if (repository.success) {
            setRepository(repository.value)
        } else if (repository.error) {
            const msg = `Failed to create ARC: ${repository.error}`
            setError(msg)
        }
        setIsCreating(false)
        setIsOpen(false)
    }

    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Create ARC">
            <div className="flex flex-col gap-4">
                <input type="text" placeholder="ARC name" className="input input-bordered w-full" value={input} onChange={(e) => setInput(e.target.value)}/>
                <button className="btn btn-primary w-full" onClick={createArc} disabled={isCreating}>
                    {isCreating ? <span className="loading loading-spinner"></span> : "Connect"}
                </button>
            </div>
        </BaseModal>
    )
}


function Dock() {
    const [isCreateArcModalOpen, setIsCreateArcModalOpen] = React.useState(false)
    return (
        <>
            <CreateArcModal isOpen={isCreateArcModalOpen} setIsOpen={setIsCreateArcModalOpen} />
            <div className="dock dock-sm">
                <button
                    type="button"
                    title="Create ARC"
                    aria-label="Create ARC"
                    onClick={() => setIsCreateArcModalOpen(true)}
                >
                    <i className="iconify mdi--plus-circle-outline size-8"/>
                </button>
            </div>
        </>
    )
}

export default function ArcBrowser() {

    const [repos, setRepos] = React.useState<Repository[]>([])
    const [isLoading, setIsLoading] = React.useState(true)
    const {token}  = useTokenContext()
    const {setError} = useErrorContext()

    const fetchRepos = async () => {
        setIsLoading(true)
        const reposResponse = await gitlabApi.listRepos(token as GitlabToken)
        if (reposResponse.success) {
            setRepos(reposResponse.value)
        } else if (reposResponse.error) {
            setError(reposResponse.error)
        }
        setIsLoading(false)
    }

    React.useEffect(() => {
        if (!token) return
        fetchRepos()
    }, [token])

    return (
        <div className="h-full overflow-hidden flex flex-col">
            {isLoading ? (
                    <LoadingSpinner />
                ) : repos.length === 0 ? (
                    <EmptyView />  
                ) : (
                    <>
                        <ArcBrowserList repos={repos} />
                        <Dock />
                    </>

                )
            }
        </div>
    )
}