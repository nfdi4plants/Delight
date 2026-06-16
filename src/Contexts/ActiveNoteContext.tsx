import {createContext, useContext} from "react";
import type { NoteRef } from "../lib/domain/types";

export type ActiveNoteContextType = {
    activeNote: NoteRef | null;
    setActiveNote: (note: NoteRef | null) => void;
}

export const ActiveNoteContext = createContext<ActiveNoteContextType>({
    activeNote: null,
    setActiveNote: () => {}
})

const useActiveNoteContext = () => useContext(ActiveNoteContext);

export default useActiveNoteContext;