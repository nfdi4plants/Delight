
import React from "react";
import * as gitlabApi from "../../lib/services/git-service";
import useTokenContext from "../../Contexts/TokenContext";
import { type GitlabToken } from "../../lib/domain/types";
import { useErrorContext } from "../../Contexts/ErrorContext";
import { type Repository } from "../../lib/domain/types";
import BaseModal from "../BaseModal";
import usePageContext from "../../Contexts/PageContext";

interface ArcBrowserListItemProps {
    repository: Repository;
}

function ArcBrowserListItem({ repository }: ArcBrowserListItemProps) {
    const [isConnecting, setIsConnecting] = React.useState(false)
    const { name, description, avatar_url } = repository;
    const { token } = useTokenContext()
    const {setError} = useErrorContext()
    const {setRepository} = usePageContext()

    const connect = async () => {
        setIsConnecting(true)
        const response = await gitlabApi.listNotes(token as GitlabToken, repository)
        if (response.success) {
            
            const v = {
                repository,
                notes: response.value
            }
            setRepository(v)
        } else if (response.error) {
            setError(response.error)
        }
        setIsConnecting(false)
    }
    return (
        <li className="list-row">
            <div>
                <img className="size-10 rounded-box" src={avatar_url || undefined}/></div>
            <div>
            <div>{name}</div>
            <div className="text-xs uppercase font-semibold opacity-60">{description}</div>
            </div>
            <button className="btn btn-square btn-accent" onClick={connect}>
                {
                    (isConnecting) ? (
                        <span className="loading loading-spinner text-primary"></span>
                    ) : (   
                        <i className="iconify mdi--link-variant size-8"/>
                    )
                }
            </button>
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
        <ul className="list max-w-md mx-auto overflow-y-auto pb-48">
    
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

    const createArc = async () => {
        const repository = await gitlabApi.createRepo(token as GitlabToken, input)
        if (repository.success) {
            const notesResponse = await gitlabApi.listNotes(token as GitlabToken, repository.value)
            if (notesResponse.success) {
                setRepository({
                    repository: repository.value,
                    notes: notesResponse.value
                })
            } else if (notesResponse.error) {
                const msg = `Failed to fetch notes for new ARC: ${notesResponse.error}`
                setError(msg)
            }
        } else if (repository.error) {
            const msg = `Failed to create ARC: ${repository.error}`
            setError(msg)
        }
        setIsOpen(false)
    }

    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Create ARC">
            <div className="flex flex-col gap-4">
                <input type="text" placeholder="ARC name" className="input input-bordered w-full" value={input} onChange={(e) => setInput(e.target.value)}/>
                <button className="btn btn-primary w-full" onClick={createArc}>Connect</button>
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
        <div className="h-full">
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