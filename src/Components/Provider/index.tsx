import React from "react";
import ErrorContextProvider from "./ErrorContextProvider";
import TokenContextProvider from "./TokenContextProvider";
import NotesStateContextProvider from "./NoteControllerContextProvider";
import ActiveNoteContextProvider from "./ActiveNoteContextProvider";
import PageContextProvider from "./PageContextProvider";

export default function Provider({ children }: { children: React.ReactNode }) {
    return (
        <ErrorContextProvider>
            <TokenContextProvider>
                <NotesStateContextProvider>
                    <ActiveNoteContextProvider>
                        <PageContextProvider>
                            {children}
                        </PageContextProvider>
                    </ActiveNoteContextProvider>    
                </NotesStateContextProvider>
            </TokenContextProvider>
        </ErrorContextProvider>
    )
}