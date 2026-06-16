import React from "react";
import { type NoteRef, type Repository } from "../lib/domain/types";
import {type Result} from "../lib/domain/result";
import type Note from "../lib/domain/note";


export type NoteControllerContextType = {
    activeRepository: Repository | null;
    setActiveRepository: (repository: Repository | null) => void;
    listNotes: (refresh?: boolean) => Promise<Result<NoteRef[]>>;
    getNote: (noteRef: NoteRef) => Promise<Result<Note>>;
    addNote: (note: Note) => Promise<Result<void>>;
}

export const NoteControllerContext = React.createContext<NoteControllerContextType>({
    activeRepository: null,
    setActiveRepository: () => {},
    listNotes: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an empty list of notes
    getNote: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an error for getNote
    addNote: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an error for addNote
})

export const useNoteControllerContext = () => React.useContext(NoteControllerContext);

export default useNoteControllerContext;