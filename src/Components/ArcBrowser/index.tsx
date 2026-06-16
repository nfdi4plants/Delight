
import React from "react";
import * as gitlabApi from "../../lib/services/git-service";
import useTokenContext from "../../Contexts/TokenContext";
import { type GitlabToken } from "../../lib/domain/types";
import { useErrorContext } from "../../Contexts/ErrorContext";
import { type Repository } from "../../lib/domain/types";
import useNotesStateContext from "../../Contexts/NotesStateContext";

interface ArcBrowserListItemProps {
    repository: Repository;
}

function ArcBrowserListItem({ repository }: ArcBrowserListItemProps) {
    const [isConnecting, setIsConnecting] = React.useState(false)
    const { name, description, avatar_url } = repository;
    const { token } = useTokenContext()
    const {setNotes} = useNotesStateContext()
    const {setError} = useErrorContext()

    const connect = async () => {
        setIsConnecting(true)
        const response = await gitlabApi.listNotes(token as GitlabToken, repository)
        if (response.success) {
            
            const v = {
                repository,
                notes: response.value
            }
            setNotes(v)
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
            <button className="btn btn-square btn-ghost" onClick={connect}>
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
        <ul className="list max-w-md mx-auto">
    
            <li className="p-4 pb-2 text-xs opacity-60 tracking-wide">Your ARCs</li>
            
            {repos.map(repo => <ArcBrowserListItem key={repo.id} repository={repo} />)} 
        </ul>
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
                    <ArcBrowserList repos={repos} />
                )
            }
        </div>
    )
}