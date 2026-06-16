import React from "react";
import MDEditor, { commands } from '@uiw/react-md-editor';
import rehypeSanitize from "rehype-sanitize";
import useActiveNoteContext from "../../Contexts/ActiveNoteContext";
import useNoteControllerContext from "../../Contexts/NoteControllerContext";
import BackButton from "../BackButton";
import SyncButton from "../SyncButton";

export default function NoteEditor() {
    const {activeNote} = useActiveNoteContext();
    const {saveNote} = useNoteControllerContext();
    const [value, setValue] = React.useState<string>(activeNote ? activeNote.content : "");

    const handleOnChange = async (value_?: string) => {
        const value = value_ || "";
        setValue(value);
    }

    const handleBeforePageChange = () => {
        if (!activeNote) return;
        saveNote(activeNote.title, activeNote.slug, value)
    }

    return (
        <div className="h-full overflow-hidden">
            <div className="flex items-center gap-2 p-2">
                <BackButton targetPage="notes-browser" beforePageChange={handleBeforePageChange} />
                <SyncButton />
            </div>
            <MDEditor
                value={value}
                onChange={handleOnChange}
                previewOptions={{
                    rehypePlugins: [[rehypeSanitize]],
                }}
                preview={"edit"}
                extraCommands={[
                    commands.codeEdit,
                    commands.codePreview,
                ]}
                height="100%"
            />
        </div>
    );
}