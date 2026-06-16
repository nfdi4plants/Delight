import {createContext, useContext} from "react";
import type { Note } from "../lib/domain/types";

export type ActiveNoteContextType = {
    activeNote: Note | null;
    setActiveNote: (note: Note | null) => void;
}

export const ActiveNoteContext = createContext<ActiveNoteContextType>({
    activeNote: null,
    setActiveNote: () => {}
})

const useActiveNoteContext = () => useContext(ActiveNoteContext);

export default useActiveNoteContext;