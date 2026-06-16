import {NotesStateContext} from "../../../Contexts/NotesStateContext";
import { useState } from "react";
import { type NoteRef, type Repository } from "../../../lib/domain/types";

export default function NotesStateContextProvider({ children }: { children: React.ReactNode }) {
    const [notes, setNotes] = useState<{ notes: NoteRef[], repository: Repository } | null>(null)

    return (
        <NotesStateContext value={{ notes, setNotes }}>
            {children}
        </NotesStateContext>
    )
}