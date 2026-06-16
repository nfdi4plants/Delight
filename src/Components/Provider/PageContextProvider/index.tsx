import {PageContext} from "../../../Contexts/PageContext";
import {useState} from "react";
import {type PageContextType} from "../../../Contexts/PageContext";
import useTokenContext from "../../../Contexts/TokenContext";
import useNotesStateContext, { type NotesState } from "../../../Contexts/NotesStateContext";
import type { GitlabToken, Note } from "../../../lib/domain/types";
import useActiveNoteContext from "../../../Contexts/ActiveNoteContext";


export default function PageContextProvider({ children }: { children: React.ReactNode }) {
    const [page, setPage] = useState<PageContextType["page"]>("authentication");
    const {setToken} = useTokenContext()
    const {setNotes} = useNotesStateContext()
    const {setActiveNote} = useActiveNoteContext()

    const setTokenAndNavigate = (token: GitlabToken) => {
        setToken(token)
        setPage("arc-browser")
    }

    const setRepositoryAndNavigate = (notesState: NotesState) => {
        setNotes(notesState)
        setPage("arc-browser")
    }

    const setActiveNoteAndNavigate = (note: Note) => {
        setActiveNote(note)
        setPage("note-editor")
    }

    const logoutAndNavigate = () => {
        setToken(null)
        setNotes(null)
        setPage("authentication")
    }


    const context = {
        page,
        setToken: setTokenAndNavigate,
        setRepository: setRepositoryAndNavigate,
        setActiveNote: setActiveNoteAndNavigate,
        logout: logoutAndNavigate
    }

    return (
        <PageContext value={context}>
            {children}
        </PageContext>
    );
}