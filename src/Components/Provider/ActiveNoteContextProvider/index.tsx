import {ActiveNoteContext} from "../../../Contexts/ActiveNoteContext";
import { useState } from "react";
import type { NoteRef } from "../../../lib/domain/types";

export default function ActiveNoteContextProvider({ children }: { children: React.ReactNode }) {
    const [activeNote, setActiveNote] = useState<NoteRef | null>(null);

    return (
        <ActiveNoteContext value={{ activeNote, setActiveNote }}>
            {children}
        </ActiveNoteContext>
    )
}