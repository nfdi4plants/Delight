import React from "react";
import { type NoteRef, type Repository } from "../lib/domain/types";

export type NotesState = {
    notes: NoteRef[]
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