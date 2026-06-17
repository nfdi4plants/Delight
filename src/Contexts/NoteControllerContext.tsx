import React from "react";
import { type NoteRef, type AssetRef, type Repository } from "../lib/domain/types";
import {type Result} from "../lib/domain/result";
import type Note from "../lib/domain/note";
import type Asset from "../lib/domain/asset";
import type { SyncReport } from "../lib/services/note-controller";


export type NoteControllerContextType = {
    activeRepository: Repository | null;
    setActiveRepository: (repository: Repository | null) => void;
    getList: () => Promise<Result<NoteRef[]>>;
    getNote: (noteRef: NoteRef) => Promise<Result<Note>>;
    saveNote : (note: Note) => Promise<Note>;
    /** Resolve an asset pointer into its bytes (cached, else downloaded). */
    getAsset: (assetRef: AssetRef) => Promise<Result<Asset>>;
    /** Whether an asset's bytes are already cached locally (no network). */
    isAvailableLocally: (assetRef: AssetRef) => Promise<boolean>;
    /** Attach a locally-captured asset to a note and queue it for sync. */
    attachAsset: (note: Note, asset: Asset) => Promise<Result<Note>>;
    syncAll: () => Promise<SyncReport>;
}

export const NoteControllerContext = React.createContext<NoteControllerContextType>({
    activeRepository: null,
    setActiveRepository: () => {},
    getList: async () => ({ success: false, error: "NoteController not initialized" }), // Default to an empty list of notes
    getNote: async (_) => ({ success: false, error: "NoteController not initialized" }), // Default to an error for getNote
    saveNote: async (_) => { throw new Error("NoteController not initialized"); }, // Default to an error for saveNoteObject
    getAsset: async () => ({ success: false, error: "NoteController not initialized" }), // Default to an error for getAsset
    isAvailableLocally: async () => false, // Default to "not cached" for isAvailableLocally
    attachAsset: async () => ({ success: false, error: "NoteController not initialized" }), // Default to an error for attachAsset
    syncAll: async () => { throw new Error("NoteController not initialized"); } // Default to an error for syncAll
})

export const useNoteControllerContext = () => React.useContext(NoteControllerContext);

export default useNoteControllerContext;