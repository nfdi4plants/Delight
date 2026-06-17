import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Asset from "../../lib/domain/asset";
import type Note from "../../lib/domain/note";
import { createTranscriber, isTranscriptionSupported, type Transcriber } from "../../lib/speech";
import useErrorContext from "../../Contexts/ErrorContext";

type AudioBoothProps = {
    // The note the memo is attached to. Its `assetsFolder` is the base
    // directory and the new Asset(s) are added to it on accept.
    note: Note;
    setNote: (note: Note) => void;
    // Called once per asset added — the audio, and the transcript .txt when
    // one is saved. Lets a parent persist or close a surrounding modal.
    onCapture?: (asset: Asset) => void;
};

// Pick the best container/codec this browser can record, preferring Opus in
// WebM (Chrome/Firefox) and falling back to MP4/AAC (Safari). Empty string
// means "let MediaRecorder choose its own default".
function pickAudioMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionForType(type: string): string {
    if (type.includes("webm")) return "webm";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("mp4")) return "m4a";
    if (type.includes("mpeg")) return "mp3";
    return "webm";
}

// A sensible default file name, distinct per recording so two memos in the
// same note don't collide.
function defaultFilename(mimeType: string): string {
    return `memo-${Date.now()}.${extensionForType(mimeType)}`;
}

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * In-browser voice-memo recorder. Captures the microphone via
 * `MediaRecorder`, turns the recording into an {@link Asset} under the note's
 * `assetsFolder`, and — where the browser supports it — live-transcribes the
 * speech and saves the transcript as a sibling `.txt` asset. Pure PWA: nothing
 * is uploaded; the bytes stay local until the note is synced.
 */
export default function AudioBooth({ note, setNote, onCapture }: AudioBoothProps) {
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const transcriberRef = useRef<Transcriber | null>(null);
    const transcriptFinalRef = useRef("");
    const { setError } = useErrorContext();

    const canTranscribe = useMemo(() => isTranscriptionSupported(), []);
    const canRecord = typeof MediaRecorder !== "undefined";

    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    // The accepted-but-not-yet-saved recording, as an object URL for playback.
    const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
    const [filename, setFilename] = useState("");
    // Live transcript while recording (final text + the in-flight guess).
    const [liveTranscript, setLiveTranscript] = useState({ final: "", interim: "" });
    // Editable transcript shown on the preview before saving.
    const [transcriptText, setTranscriptText] = useState("");
    const [saveTranscript, setSaveTranscript] = useState(false);

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const startRecording = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia || !canRecord) {
            setError("This device or browser does not support audio recording.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mimeType = pickAudioMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const type = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type });
                releaseStream();
                setFilename(defaultFilename(blob.type));
                setTranscriptText(transcriptFinalRef.current);
                setPreview({ url: URL.createObjectURL(blob), blob });
                setIsRecording(false);
            };

            // Reset transcript state and, if enabled+supported, start listening.
            transcriptFinalRef.current = "";
            setLiveTranscript({ final: "", interim: "" });
            if (saveTranscript && canTranscribe) {
                const transcriber = createTranscriber({
                    onUpdate: (final, interim) => {
                        transcriptFinalRef.current = final;
                        setLiveTranscript({ final, interim });
                    },
                    onError: () =>
                        setError("Transcription stopped; the recording continues without it."),
                });
                transcriberRef.current = transcriber;
                transcriber?.start();
            }

            recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
        } catch {
            setError("Could not access the microphone. Check your browser permissions.");
            releaseStream();
        }
    }, [canRecord, canTranscribe, saveTranscript, releaseStream, setError]);

    const stopRecording = useCallback(() => {
        transcriberRef.current?.stop();
        transcriberRef.current = null;
        recorderRef.current?.stop(); // fires onstop, which builds the preview
        recorderRef.current = null;
    }, []);

    const discard = useCallback(() => {
        setPreview(null);
        setTranscriptText("");
    }, []);

    const accept = useCallback(() => {
        if (!preview) return;
        const name = filename.trim();
        if (name.length === 0) {
            setError("Please enter a file name for the recording.");
            return;
        }

        const audio = Asset.create(`${note.assetsFolder}/${name}`, preview.blob);
        if (!audio.success) {
            setError(audio.error);
            return;
        }
        const addedAudio = note.addAsset(audio.value);
        if (!addedAudio.success) {
            setError(addedAudio.error);
            return;
        }
        setNote(note); // trigger re-render with the new asset
        onCapture?.(audio.value);

        // Save the transcript as a sibling .txt, named after the audio file.
        const text = transcriptText.trim();
        if (saveTranscript && text.length > 0) {
            const txtName = `${name.replace(/\.[^/.]+$/, "")}.txt`;
            const txtBlob = new Blob([text], { type: "text/plain" });
            const txt = Asset.create(`${note.assetsFolder}/${txtName}`, txtBlob);
            if (!txt.success) {
                setError(txt.error);
            } else {
                const addedTxt = note.addAsset(txt.value);
                if (!addedTxt.success) setError(addedTxt.error);
                else {
                    setNote(note); // trigger re-render with the new asset
                    onCapture?.(txt.value);
                }
            }
        }

        setPreview(null);
        setTranscriptText("");
    }, [preview, filename, transcriptText, saveTranscript, note, onCapture, setError]);

    // Tick the elapsed-time counter while recording.
    useEffect(() => {
        if (!isRecording) return;
        setElapsed(0);
        const id = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => clearInterval(id);
    }, [isRecording]);

    // Revoke the preview object URL whenever it changes or unmounts.
    useEffect(() => {
        if (!preview) return;
        return () => URL.revokeObjectURL(preview.url);
    }, [preview]);

    // Release the mic and stop recognition if we unmount mid-session.
    useEffect(() => {
        return () => {
            transcriberRef.current?.stop();
            recorderRef.current?.stop();
            releaseStream();
        };
    }, [releaseStream]);

    const folderHint = useMemo(() => `${note.assetsFolder}/`, [note]);

    return (
        <div className="flex flex-col items-center gap-4">
            {!canRecord ? (
                <p className="text-error text-sm">
                    Audio recording is not supported in this browser.
                </p>
            ) : preview ? (
                <div className="flex w-full max-w-lg flex-col gap-3">
                    <audio src={preview.url} controls className="w-full" />

                    <label className="form-control w-full">
                        <span className="label-text text-xs opacity-60">{folderHint}</span>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="file name"
                            autoFocus
                        />
                    </label>

                    {canTranscribe && (
                        <label className="fieldset w-full">
                            <legend className="fieldset-legend">Transcript options</legend>
                            <div className="label cursor-pointer justify-start gap-2 px-0">
                                <input
                                    type="checkbox"
                                    className="toggle toggle-sm"
                                    checked={saveTranscript}
                                    onChange={(e) => setSaveTranscript(e.target.checked)}
                                />
                                <span>
                                    Save transcript
                                </span>
                            </div>
                            <p className="label">
                                Will be saved as "{filename.replace(/\.[^/.]+$/, "") || "memo"}.txt"
                            </p>
                            <textarea
                                className="textarea textarea-bordered h-28 w-full"
                                value={transcriptText}
                                onChange={(e) => setTranscriptText(e.target.value)}
                                placeholder="Transcript (edit as needed)…"
                                disabled={!saveTranscript}
                            />
                        </label>
                    )}

                    <div className="flex justify-end gap-3">
                        <button className="btn btn-ghost" onClick={discard}>
                            <i className="iconify mdi--delete-outline size-5" />
                            Discard
                        </button>
                        <button className="btn btn-primary" onClick={accept}>
                            <i className="iconify mdi--check size-5" />
                            Use recording
                        </button>
                    </div>
                </div>
            ) : isRecording ? (
                <div className="flex w-full max-w-lg flex-col items-center gap-4">
                    <div className="flex items-center gap-3 text-2xl font-semibold">
                        <span className="inline-block size-3 animate-pulse rounded-full bg-red-500" />
                        {formatDuration(elapsed)}
                    </div>
                    {canTranscribe && saveTranscript && (
                        <div className="bg-base-200 min-h-16 w-full rounded-box p-3 text-sm">
                            {liveTranscript.final ? (
                                <span>{liveTranscript.final} </span>
                            ) : (
                                <span className="opacity-40">Listening…</span>
                            )}
                            <span className="opacity-50">{liveTranscript.interim}</span>
                        </div>
                    )}
                    <button className="btn btn-error btn-lg" onClick={stopRecording}>
                        <i className="iconify mdi--stop size-6" />
                        Stop
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    {canTranscribe ? (
                        <>
                            <label className="label cursor-pointer gap-2">
                                <input
                                    type="checkbox"
                                    className="toggle toggle-sm"
                                    checked={saveTranscript}
                                    onChange={(e) => setSaveTranscript(e.target.checked)}
                                />
                                <span className="label-text">Transcribe while recording</span>
                            </label>
                            <span className="text-xs opacity-50">
                                This can be unreliable, sends audio to Google servers.
                            </span>
                        </>
                    ) : (
                        <span className="text-xs opacity-50">
                            Live transcription isn't available in this browser.
                        </span>
                    )}
                    <button className="btn btn-primary btn-xl m-4" onClick={startRecording}>
                        <i className="iconify mdi--microphone size-6" />
                        Record
                    </button>
                </div>
            )}
        </div>
    );
}
