import {NotesStateContext} from "../../../Contexts/NotesStateContext";
import { useState } from "react";
import { type Note, type Repository } from "../../../lib/domain/types";

export default function NotesStateContextProvider({ children }: { children: React.ReactNode }) {
    const [notes, setNotes] = useState<{ notes: Note[], repository: Repository } | null>(null)

    return (
        <NotesStateContext value={{ notes, setNotes }}>
            {children}
        </NotesStateContext>
    )
}