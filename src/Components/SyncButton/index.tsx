import useNoteControllerContext from "../../Contexts/NoteControllerContext";
import useErrorContext from "../../Contexts/ErrorContext";
import type { Result } from "../../lib/domain/result";
import type { SyncReport } from "../../lib/services/note-controller";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";


function ReportToast({report, close}: {report: SyncReport | null, close: () => void}) {

    const timerRef = useRef<number>(null);

    useEffect(() => {
        if (report && (report.kind === "idle" || report.kind === "uploaded")) {
            const timer = setTimeout(() => {
                close();
            }, 3000);
            timerRef.current = timer;
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        }
    }, [report])

    if (!report) return null;
    // check if close
    return (
        <div className="toast">
            <div className={"alert " + (report.kind === "idle" ? "alert-info" : report.kind === "uploaded" ? "alert-success" : report.kind === "merge-request" ? "alert-warning" : report.kind === "failed" ? "alert-error" : "")}>
                {
                    report.kind === "idle" ?
                        <>No changes to sync</>
                    : report.kind === "uploaded" ?
                        <>Uploaded {report.notes.length} notes</>
                    : report.kind === "merge-request" ?
                        <>
                            Uploaded {report.notes.length} notes. Encountered merge conflicts. Please review
                            <a
                                href={report.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="link link-secondary"
                            >Merge Request</a>
                            .
                        </>
                    : report.kind === "failed" ?
                        <>
                            Sync for {report.notes.length} notes failed: {report.error}
                        </>
                    : null
                }
                {(report.kind === "merge-request" || report.kind === "failed") &&
                    <button className="btn btn-sm btn-ghost" onClick={close}>
                        <i className="iconify mdi--close size-6"></i>
                    </button>
                }
            </div>
        </div>
    )
}

export default function SyncButton({beforeSubmit, mlAuto = true}: {beforeSubmit?: () => Promise<Result<any>>, mlAuto?: boolean}) {
    const { syncAll } = useNoteControllerContext();
    const { setError } = useErrorContext();
    const [isSyncing, setIsSyncing] = useState(false);
    const [report, setReport] = useState<SyncReport | null>(null);

    const handleClick = async () => {
        setIsSyncing(true);
        if (beforeSubmit) {
            const result = await beforeSubmit();    
            if (result.success) {
                const report = await syncAll();
                setReport(report);
            } else {
                setError(result.error);
            }
        } else {
            const report = await syncAll();
            setReport(report);
        }
        setIsSyncing(false);
    }

    return (
        <>
            {
                createPortal(
                    <ReportToast report={report} close={() => setReport(null)} />,
                    document.body
                )

            }
            <button 
                className={`btn btn-sm btn-square btn-secondary ${mlAuto ? "ml-auto" : ""}`}
                onClick={handleClick}
                title="Refresh notes list"
                aria-label="Refresh notes list"
                disabled={isSyncing}
            >
                {isSyncing ? 
                    <span className="loading loading-spinner"></span> 
                    : <i className="iconify mdi--cloud-refresh size-5"></i>
                }
            </button>
        </>
    )
}