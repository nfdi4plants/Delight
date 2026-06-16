import React from "react";
import { type NoteRef, type Repository } from "../lib/domain/types";
import {type Result} from "../lib/domain/result";
import type Note from "../lib/domain/note";
import type { SyncReport } from "../lib/services/note-controller";


export type NoteControllerContextType = {
    activeRepository: Repository | null;
    setActiveRepository: (repository: Repository | null) => void;
    getList: () => Promise<Result<NoteRef[]>>;
    getNote: (noteRef: NoteRef) => Promise<Result<Note>>;
    saveNote: (name: string, slug: string, content?: string) => Promise<Result<Note>>;
    syncAll: () => Promise<SyncReport>;
}

export const NoteControllerContext = React.createContext<NoteControllerContextType>({
    activeRepository: null,
    setActiveRepository: () => {},
    getList: async () => ({ success: false, error: "NoteController not initialized" }), // Default to an empty list of notes
    getNote: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an error for getNote
    saveNote: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an error for addNote
    syncAll: async () => { throw new Error("NoteController not initialized"); } // Default to an error for syncAll
})

export const useNoteControllerContext = () => React.useContext(NoteControllerContext);

export default useNoteControllerContext;