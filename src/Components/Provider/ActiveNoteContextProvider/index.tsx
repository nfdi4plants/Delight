import {ActiveNoteContext} from "../../../Contexts/ActiveNoteContext";
import { useState } from "react";
import Note from "../../../lib/domain/note";
import type { NoteSnapshot } from "../../../lib/domain/note";

function toNote(snapshot: NoteSnapshot | null): Note | null {
    if (!snapshot) return null;
    const note = Note.fromSnapshot(snapshot);
    if (!note.success) {
        console.error("Failed to convert snapshot to Note:", note.error);
        return null;
    }
    return note.value;
}

function fromNote(note: Note | null): NoteSnapshot | null {
    if (!note) return null;
    return note.toSnapshot();
}

export default function ActiveNoteContextProvider({ children }: { children: React.ReactNode }) {
    const [activeNote, setActiveNote] = useState<NoteSnapshot | null>(null);

    /**
     * Parse noteSnapshot to and from Note to ensure it is a new object ref, as react
     * does not rerender if the same object ref is set, even if its content has changed. 
     */
    const context = {
        activeNote: toNote(activeNote),
        setActiveNote: (note: Note | null) => {
            setActiveNote(fromNote(note));
        }
    };

    return (
        <ActiveNoteContext value={context}>
            {children}
        </ActiveNoteContext>
    )
}