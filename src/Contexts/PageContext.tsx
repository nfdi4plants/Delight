import {createContext, useContext} from "react";
import type { GitlabToken } from "../lib/domain/types";
import type { NotesState } from "./NotesStateContext";
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
    setRepository: (repository: NotesState) => void
    logout: () => void
    setPage: (page: PageState) => void
}

export const PageContext = createContext<PageContextType>({
    page: "authentication",
    setToken: () => {},
    setRepository: () => {},
    setActiveNote: () => {},
    logout: () => {},
    setPage: () => {}
})

const usePageContext = () => useContext(PageContext);

export default usePageContext;