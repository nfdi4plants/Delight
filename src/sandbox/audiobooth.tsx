// Standalone dev harness for the AudioBooth component. It mounts AudioBooth on
// a throwaway in-memory Note — no auth, no repository, no saving — so the
// record/transcribe flow can be exercised in isolation from the rest of the
// app.
//
// Run `npm run dev` and open `/Delight/audiobooth.html`.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../tailwind.css";
import ErrorContextProvider from "../Components/Provider/ErrorContextProvider";
import AudioBooth from "../Components/AudioBooth";
import { isTranscriptionSupported } from "../lib/speech";
import Note from "../lib/domain/note";
import type Asset from "../lib/domain/asset";

// A mock note to attach captures to. Its `assetsFolder` drives the paths;
// nothing is persisted.
const mockNoteResult = Note.create("Sandbox Note", "sandbox-note", "");
if (!mockNoteResult.success) throw new Error(mockNoteResult.error);
const mockNote = mockNoteResult.value;

async function blobText(blob: Blob): Promise<string> {
    return blob.type.startsWith("text/") ? blob.text() : "";
}

function Sandbox() {
    // Keep a preview URL (and any text) per captured asset.
    const [shots, setShots] = useState<{ asset: Asset; url: string; text: string }[]>([]);

    const handleCapture = async (asset: Asset) => {
        const text = await blobText(asset.blob);
        const url = asset.blob.type.startsWith("text/") ? "" : URL.createObjectURL(asset.blob);
        setShots((prev) => [{ asset, url, text }, ...prev]);
    };

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
            <div>
                <h1 className="text-2xl font-bold">AudioBooth sandbox</h1>
                <p className="text-sm opacity-60">
                    Mock note assets folder: <code>{mockNote.assetsFolder}</code>
                </p>
                <p className="text-sm opacity-60">
                    Live transcription supported: <code>{String(isTranscriptionSupported())}</code>
                </p>
            </div>

            <AudioBooth note={mockNote} onCapture={handleCapture} />

            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">Captured assets ({shots.length})</h2>
                {shots.length === 0 ? (
                    <p className="text-sm opacity-50">Nothing captured yet.</p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {shots.map(({ asset, url, text }) => (
                            <li key={asset.path} className="flex flex-col gap-1">
                                <div className="font-mono text-sm">{asset.path}</div>
                                <div className="text-xs opacity-60">
                                    {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                                </div>
                                {url && <audio src={url} controls className="w-full max-w-sm" />}
                                {text && (
                                    <pre className="bg-base-200 rounded p-2 text-xs whitespace-pre-wrap">
                                        {text}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ErrorContextProvider>
            <Sandbox />
        </ErrorContextProvider>
    </StrictMode>
);
