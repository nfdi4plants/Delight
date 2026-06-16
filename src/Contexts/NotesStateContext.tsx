import React from "react";
import { type Note, type Repository } from "../lib/domain/types";

export type NotesState = {
    notes: Note[]
    repository: Repository
}

export type NotesStateContextType = {
    notes: NotesState | null;
    setNotes: React.Dispatch<React.SetStateAction<NotesState | null>>;
}

export const NotesStateContext = React.createContext<NotesStateContextType>({
    notes: null,
    setNotes: () => {}
})

export const useNotesStateContext = () => React.useContext(NotesStateContext);

export default useNotesStateContext;