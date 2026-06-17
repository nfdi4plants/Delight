import {NoteControllerContext, type NoteControllerContextType} from "../../../Contexts/NoteControllerContext";
import { useRef, useState } from "react";
import { type NoteRef, type Repository } from "../../../lib/domain/types";
import NoteController from "../../../lib/services/note-controller";
import useTokenContext from "../../../Contexts/TokenContext";
import { useErrorContext } from "../../../Contexts/ErrorContext";
import Note from "../../../lib/domain/note";

type RepoController = Map<number, NoteController>; // Map from repository ID to its NoteController

export default function NotesStateContextProvider({ children }: { children: React.ReactNode }) {
    const repoControllers = useRef<RepoController>(new Map());
    const [activeRepository, setActiveRepository] = useState<Repository | null>(null);
    const {setError} = useErrorContext();
    const {token} = useTokenContext();

    const ensureController = (repository: Repository | null): NoteController => {
        if (!token) throw setError("GitLab token is required to manage notes");
        if (!repository) throw setError("Active repository is required to manage notes");
        let controller = repoControllers.current.get(repository.id);
        if (!controller) {
            controller = new NoteController(token, repository);
            repoControllers.current.set(repository.id, controller);
        }        
        return controller;
    }

    const context: NoteControllerContextType = {
        activeRepository,
        setActiveRepository,
        getList: async () => {
            const controller = ensureController(activeRepository);
            return controller.getList();
        },
        getNote: async (noteRef: NoteRef) => {
            const controller = ensureController(activeRepository);
            return controller.getNote(noteRef);
        },
        saveNote: async (note: Note) => {
            const controller = ensureController(activeRepository);
            await controller.saveNote(note);
            return note
        },
        syncAll: async () => {
            const controller = ensureController(activeRepository);
            return controller.sync();
        }
    }

    return (
        <NoteControllerContext value={context}>
            {children}
        </NoteControllerContext>
    )
}