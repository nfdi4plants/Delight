import {createContext, useContext} from "react";
import type { GitlabToken, NoteRef, Repository } from "../lib/domain/types";
import type Note from "../lib/domain/note";

export type PageState =
	"authentication"
    | "arc-browser"
    | "notes-browser"
    | "note-editor"

export type PageContextType = {
    page: PageState
    setToken: (token: GitlabToken) => void
    setActiveNote: (note: Note) => void
    setActiveNoteByRef: (noteRef: NoteRef) => void
    setRepository: (repository: Repository) => void
    logout: () => void
    setPage: (page: PageState) => void
}

export const PageContext = createContext<PageContextType>({
    page: "authentication",
    setToken: () => {},
    setRepository: () => {},
    setActiveNote: () => {},
    setActiveNoteByRef: () => {},
    logout: () => {},
    setPage: () => {}
})

const usePageContext = () => useContext(PageContext);

export default usePageContext;