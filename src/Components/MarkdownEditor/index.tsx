import React from "react";
import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from "rehype-sanitize";
import useActiveNoteContext from "../../Contexts/ActiveNoteContext";
import useNoteControllerContext from "../../Contexts/NoteControllerContext";

export default function App() {
    const {activeNote} = useActiveNoteContext();
    // const {saveNote} = useNoteControllerContext();
    const [value, setValue] = React.useState<string>(`**Hello world!!!** <IFRAME SRC=\"javascript:javascript:alert(window.origin);\"></IFRAME>`);
    const editorRef = React.useRef<HTMLDivElement>(null);
    const getCursorPos = () => {
        const textarea = editorRef.current?.querySelector("textarea");
        console.log(textarea?.selectionStart);
    };

    return (
        <div className="container">
            <button 
                onClick={getCursorPos}>
                    Get Cursor Position
            </button>
            <MDEditor
                ref={editorRef}
                value={value}
                onChange={e => setValue(e || "")}
                previewOptions={{
                    rehypePlugins: [[rehypeSanitize]],
                }}
            />
        </div>
    );
}