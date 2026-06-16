import {NoteControllerContext, type NoteControllerContextType} from "../../../Contexts/NoteControllerContext";
import { useRef, useState } from "react";
import { type NoteRef, type Repository } from "../../../lib/domain/types";
import NoteController from "../../../lib/services/note-controller";
import useTokenContext from "../../../Contexts/TokenContext";
import { useErrorContext } from "../../../Contexts/ErrorContext";

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
        listNotes: async (refresh = false) => {
            const controller = ensureController(activeRepository);
            return controller.list({ refresh });
        },
        getNote: async (noteRef: NoteRef) => {
            const controller = ensureController(activeRepository);
            return controller.getNote(noteRef);
        },
        createLocalNote: async (name: string, slug: string, content?: string) => {
            const controller = ensureController(activeRepository);
            return controller.createNote(name, slug, { content });
        },
        syncAll: async () => {
            const controller = ensureController(activeRepository);
            return controller.saveAll();
        }
    }

    return (
        <NoteControllerContext value={context}>
            {children}
        </NoteControllerContext>
    )
}