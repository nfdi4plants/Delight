import useNoteControllerContext from "../../Contexts/NoteControllerContext";
import useErrorContext from "../../Contexts/ErrorContext";
import type { Result } from "../../lib/domain/result";

export default function SyncButton({beforeSubmit}: {beforeSubmit?: () => Promise<Result<void>>}) {
    const { syncAll } = useNoteControllerContext();
    const { setError } = useErrorContext();

    const handleClick = async () => {
        if (beforeSubmit) {
            const result = await beforeSubmit();    
            if (result.success) {
                syncAll();
            } else {
                setError(result.error);
            }
        }
    }

    return (
        <button 
            className="btn btn-sm btn-square btn-secondary ml-auto"
            onClick={handleClick}
            title="Refresh notes list"
            aria-label="Refresh notes list"
        >
            <i className="iconify mdi--cloud-refresh size-5"></i>
        </button>
    )
}