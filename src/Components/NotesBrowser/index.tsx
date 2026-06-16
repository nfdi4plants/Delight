import React from "react";
import BaseModal from "../BaseModal";
import useNotesStateContext from "../../Contexts/NotesStateContext";
import useTokenContext from "../../Contexts/TokenContext";
import useErrorContext from "../../Contexts/ErrorContext";
import { type Repository, type Note } from "../../lib/domain/types";
import * as gitlabApi from "../../lib/services/git-service";
import { getNotesPath, NotesTitlePattern } from "../../lib/services/notes";

function CreateNoteModal({isOpen, setIsOpen}: {isOpen: boolean, setIsOpen: (isOpen: boolean) => void}) {
    const [input, setInput] = React.useState("")
    const {token} = useTokenContext()
    const {setError} = useErrorContext()
    const {notes} = useNotesStateContext()

    const isValid = NotesTitlePattern.test(input)

    const createNote = async () => {
        if (!token) return setError("No token found")
        if (!notes) return setError("No repository found")
        if (!input) return setError("Note name cannot be empty")
        if (!isValid) return setError("Invalid note name. Note names must be alphanumeric, can only contain letters, numbers and dashes.")
        const repo = notes?.repository
        const path = getNotesPath(input)
        const response = await gitlabApi.pushNote(token, repo, path, `# ${input}`, `Create note ${input}`)
        if (!response.success) {
            setError(`Error creating note: ${response.error}`)
        }
    }

    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Create Note">
            <div className="flex flex-col gap-4">
                <p className="text-sm opacity-60">A note will be created with the name in the format YYYYMMDD-note-name.md</p>
                <input 
                    pattern={NotesTitlePattern.source}
                    required 
                    type="text" 
                    placeholder="Note name" 
                    className="validator input input-bordered w-full" 
                    value={input} 
                    onChange={e => setInput(e.target.value)}/>
                <p className="validator-hint">
                    Must be alphanumeric, can only contain letters, numbers and dashes. Cannot be empty.
                </p>
                <button
                    className="btn btn-primary w-full" 
                    onClick={createNote} 
                    disabled={!isValid}>
                        Create
                </button>
            </div>
        </BaseModal>
    )
}

function Dock() {
    const [isCreateNoteModalOpen, setIsCreateNoteModalOpen] = React.useState(false)
    return (
        <>
            <CreateNoteModal isOpen={isCreateNoteModalOpen} setIsOpen={setIsCreateNoteModalOpen} />
            <div className="dock dock-sm">
                <button
                    type="button"
                    title="Create Note"
                    aria-label="Create Note"
                    onClick={() => setIsCreateNoteModalOpen(true)}
                >
                    <i className="iconify mdi--plus-circle-outline size-8"/>
                </button>
            </div>
        </>
    )
}

function NotesBrowserListItem({note}: {note: Note}) {
    return (
        <li className="list-row">
            <div>{note.name}</div>
            <div className="text-xs uppercase font-semibold opacity-60">{note.path}</div>
        </li>
    )
}

function NotesBrowserList({notes}: {notes: Note[]}) {

    return (
        <ul className="list max-w-md mx-auto grow overflow-y-auto">

            {
                notes.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="text-2xl opacity-60">No notes found</div>
                        <div className="text-sm opacity-40">Create a note in your repository to get started</div>
                    </div>
                ) : notes.map(note => <NotesBrowserListItem key={note.path} note={note} />)
            }
            
             
        </ul>
    )
}

function Metadata({repository}: {repository: Repository}) {
    return (
        <div className="flex flex-col p-2 gap-1">
            <h1 className="text-2xl font-bold">{repository.name}</h1>
            {repository.description && <p className="text-sm opacity-70">{repository.description}</p>}
        </div>
    )
}

export default function NotesBrowser() {
    const { notes } = useNotesStateContext()

    if (!notes) return null

    return (
        <div className="h-full w-full">
            <Metadata repository={notes.repository} />
            <NotesBrowserList notes={notes.notes} />
            <Dock />
        </div>
    )
}