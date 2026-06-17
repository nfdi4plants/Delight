import React from "react";
import BaseModal from "../BaseModal";
import useNoteControllerContext from "../../Contexts/NoteControllerContext";
import { type Repository, type NoteRef } from "../../lib/domain/types";
import Note, {SLUG_PATTERN} from "../../lib/domain/note";
import usePageContext from "../../Contexts/PageContext";
import { useErrorContext } from "../../Contexts/ErrorContext";
import BackButton from "../BackButton";
import SyncButton from "../SyncButton";

function CreateNoteModal({isOpen, setIsOpen}: {isOpen: boolean, setIsOpen: (isOpen: boolean) => void}) {
    const [input, setInput] = React.useState("")
    const [slug, setSlug] = React.useState("")
    const {saveNote} = useNoteControllerContext()
    const {setError} = useErrorContext();
    const {setActiveNote} = usePageContext();
    const [isCreating, setIsCreating] = React.useState(false)

    const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        const slug = Note.slugify(value)
        if (slug) {
            setInput(value)
            setSlug(slug)
        }
        setInput(value)
    }

    const isValid = SLUG_PATTERN.test(slug)

    const createNote = async () => {
        if (!isValid) return;
        setIsCreating(true)
        const note = Note.create(input, slug, `# ${input}`)
        if (note.success) {
            await saveNote(note.value)
            setActiveNote(note.value)
        } else {
            setError(note.error)
        }
        setIsCreating(false)
        setIsOpen(false)
    }

    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Create Note">
            <div className="fieldset">
                <p className="label whitespace-normal">A note will be created with the name in the format YYYYMMDD-note-name.md</p>
                <p className="fieldset-legend">Title</p>
                <input
                    required 
                    type="text" 
                    title="The title of the note, it can be changed later. It is used to generate the filename."
                    placeholder="Note name" 
                    className="input input-bordered w-full" 
                    value={input} 
                    onChange={handleOnChange}/>
                <p className="fieldset-legend">Filename</p>
                <div className="join">
                    <input 
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        type="text" 
                        required
                        pattern={SLUG_PATTERN.source}
                        placeholder="filename" 
                        className="validator input input-bordered w-full join-item"
                        title="The filename of the note, it must be unique and can only contain lowercase letters, numbers and dashes."
                    />
                    <span className="join-item w-min input input-bordered cursor-not-allowed">.md</span>
                </div>
                <p className="validator-hint">
                    Filename must be alphanumeric, can only contain letters, numbers and dashes. Cannot be empty.
                </p>
                <button
                    className="btn btn-primary w-full" 
                    onClick={createNote} 
                    disabled={!isValid || isCreating}>
                        {isCreating ? <span className="loading loading-spinner"></span> : "Create"}
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

function NotesBrowserListItem({note}: {note: NoteRef}) {
    const {setActiveNoteByRef} = usePageContext();
    return (
        <li 
            onClick={() => setActiveNoteByRef(note)}
            className="list-row hover:bg-base-200 cursor-pointer"
        >
            <div>
                <div>{note.name}</div>
                <div className="text-xs font-semibold opacity-60">{note.path}</div>
            </div>
        </li>
    )
}

function NotesBrowserList({notes}: {notes: NoteRef[]}) {

    return (
        <ul className="list grow max-w-md overflow-y-auto pb-48">

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
        // Could be refactored into ActionBar component
        <div className="flex flex-col p-2 gap-1">
            <div className="flex items-center gap-2">
                <BackButton targetPage="arc-browser" />
                <h1 className="text-2xl font-bold">{repository.name}</h1>
                <SyncButton />
            </div>
        </div>
    )
}

export default function NotesBrowser() {
    const [notes, setNotes] = React.useState<NoteRef[]>([])
    const {setError} = useErrorContext()
    const [isLoading, setIsLoading] = React.useState(true)
    const {activeRepository, getList: listNotes} = useNoteControllerContext()

    const fetchNotes = async () => {
        setIsLoading(true)
        const response = await listNotes()
        if (response.success) {
            setNotes(response.value)
        } else {
            setError(response.error)
            setNotes([])
        }   
        setIsLoading(false)
    }

    React.useEffect(() => {
        fetchNotes()
    }, [])

    return (
        <div className="h-full w-full overflow-hidden flex flex-col">
            {
                activeRepository === null ?
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="text-2xl opacity-60">No ARC connected</div>
                        <div className="text-sm opacity-40">Connect an ARC to view its notes</div>
                    </div>
                : <>
                    <Metadata repository={activeRepository} />
                    {isLoading ? 
                        <div className="flex flex-col items-center gap-4 py-8">
                            <span className="loading loading-spinner text-primary"></span>
                            <div className="text-sm opacity-60">Loading notes...</div>
                        </div>
                    : <>
                        <NotesBrowserList notes={notes} />
                        <Dock />
                    </>}   
                </>
            }   
        </div>
    )
}