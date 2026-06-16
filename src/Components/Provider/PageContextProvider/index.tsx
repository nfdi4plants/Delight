import {PageContext, type PageState} from "../../../Contexts/PageContext";
import {useState} from "react";
import useTokenContext from "../../../Contexts/TokenContext";
import useNoteControllerContext from "../../../Contexts/NoteControllerContext";
import type { GitlabToken, Repository, NoteRef } from "../../../lib/domain/types";
import useActiveNoteContext from "../../../Contexts/ActiveNoteContext";
import { useErrorContext } from "../../../Contexts/ErrorContext";
import type Note from "../../../lib/domain/note";

export default function PageContextProvider({ children }: { children: React.ReactNode }) {
    const {token, setToken} = useTokenContext()
    const {setError} = useErrorContext()
    const {activeRepository, setActiveRepository, getNote} = useNoteControllerContext()
    const {activeNote, setActiveNote} = useActiveNoteContext()
    const startPage = token === null ? "authentication" : "arc-browser"
    const [page, setPage] = useState<PageState>(startPage);
    const setTokenAndNavigate = (token: GitlabToken) => {
        setToken(token)
        setPage("arc-browser")
    }

    const setRepositoryAndNavigate = (repo: Repository) => {
        setActiveRepository(repo)
        setPage("notes-browser")
    }

    const setActiveNoteAndNavigate = (note: Note) => {
        setActiveNote(note)
        setPage("note-editor")
    }

    const setActiveNoteByRefAndNavigate = async (noteRef: NoteRef) => {
        const note = await getNote(noteRef)
        if (note.success) {
            setActiveNote(note.value)
            setPage("note-editor")
        } else {
            setError(note.error)
        }
    }

    const logoutAndNavigate = () => {
        setToken(null)
        setActiveRepository(null)
        setActiveNote(null)
        setPage("authentication")
    }

    const handleNavigate = (page: PageState) => {
        if (token === null && page !== "authentication") {
            setError("You must be authenticated to access this page: " + page + ".")
            return
        }
        if (activeRepository === null && page === "notes-browser") {
            setError("You must have a repository selected to access this page: " + page + ".")
            return
        }
        if (activeNote === null && page === "note-editor") {
            setError("You must have an active note selected to access this page: " + page + ".")
            return
        }
        setPage(page)
    }


    const context = {
        page,
        setToken: setTokenAndNavigate,
        setRepository: setRepositoryAndNavigate,
        setActiveNote: setActiveNoteAndNavigate,
        setActiveNoteByRef: setActiveNoteByRefAndNavigate,
        logout: logoutAndNavigate,
        setPage: handleNavigate
    }

    return (
        <PageContext value={context}>
            {children}
        </PageContext>
    );
}