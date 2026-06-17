import React, { Suspense, useState } from "react";
import MDEditor, { commands } from '@uiw/react-md-editor';
import rehypeSanitize from "rehype-sanitize";
import useActiveNoteContext from "../../Contexts/ActiveNoteContext";
import useNoteControllerContext from "../../Contexts/NoteControllerContext";
import BackButton from "../BackButton";
import SyncButton from "../SyncButton";
import type Note from "../../lib/domain/note";
import type { Result } from "../../lib/domain/result";
import BaseModal from "../BaseModal";
import type Asset from "../../lib/domain/asset";
import type { AssetRef } from "../../lib/domain/types";
import piexif from "piexifjs";
import { createPortal } from "react-dom";

const LazyPhotoBooth = React.lazy(() => import("../PhotoBooth"));
const LazyAudioBooth = React.lazy(() => import("../AudioBooth"));

// Read the EXIF back out of a captured JPEG so we can prove it was embedded.
// Returns a short human-readable summary, or a note for non-JPEG/no-EXIF.
async function readExifSummary(blob: Blob): Promise<string> {
    if (blob.type !== "image/jpeg") return "no EXIF (not a JPEG)";
    const dataUrl: string = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });

    const data = piexif.load(dataUrl);
    const zeroth = data["0th"] ?? {};
    const exif = data.Exif ?? {};
    const gps = data.GPS ?? {};

    const taken = exif[piexif.ExifIFD.DateTimeOriginal];
    const software = zeroth[piexif.ImageIFD.Software];

    let location = "no GPS";
    const lat = gps[piexif.GPSIFD.GPSLatitude];
    const lon = gps[piexif.GPSIFD.GPSLongitude];
    if (lat && lon) {
        const latDeg = piexif.GPSHelper.dmsRationalToDeg(lat, gps[piexif.GPSIFD.GPSLatitudeRef]);
        const lonDeg = piexif.GPSHelper.dmsRationalToDeg(lon, gps[piexif.GPSIFD.GPSLongitudeRef]);
        location = `${latDeg.toFixed(5)}, ${lonDeg.toFixed(5)}`;
    }

    return `taken=${taken ?? "?"} · software=${software ?? "?"} · gps=${location}`;
}


type DockModalType = "photo" | "audio" | null;

function PhotoBoothModal({note, setNote, isOpen, setIsOpen}: {note: Note, isOpen: boolean, setIsOpen: (isOpen: boolean) => void, setNote: (note: Note) => void}) {
    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Photo Booth">
            <Suspense fallback={
                <div className="flex h-40 items-center justify-center">
                    <span className="loading loading-spinner text-primary"></span>
                </div>
            }>
                {isOpen ?
                    <LazyPhotoBooth 
                        note={note}
                        setNote={setNote}
                    />
                : null}
            </Suspense>
        </BaseModal>
    )
}

function AudioRecorderModal({note, setNote, isOpen, setIsOpen}: {note: Note, setNote: (note: Note) => void, isOpen: boolean, setIsOpen: (isOpen: boolean) => void}) {
    return (
        <BaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Audio Recorder">
            <Suspense fallback={
                <div className="flex h-40 items-center justify-center">
                    <span className="loading loading-spinner text-primary"></span>
                </div>
            }>
                {isOpen ?
                    <LazyAudioBooth 
                        setNote={setNote}
                        note={note}
                    />
                : null}
            </Suspense>
        </BaseModal>
    )
}

function Dock({note, setNote}: {note: Note, setNote: (note: Note) => void}) {
    const [modalOpen, setModalOpen] = React.useState<DockModalType>(null);

    return (
        <>
            <PhotoBoothModal 
                note={note} 
                setNote={setNote}
                isOpen={modalOpen === "photo"} 
                setIsOpen={(isOpen) => setModalOpen(isOpen ? "photo" : null)} />
            <AudioRecorderModal
                note={note}
                setNote={setNote}
                isOpen={modalOpen === "audio"}
                setIsOpen={(isOpen) => setModalOpen(isOpen ? "audio" : null)} />
            <div className="dock bg-neutral text-neutral-content">

                <button onClick={() => setModalOpen("audio")}>
                    <i className="iconify mdi--microphone size-8"/>
                </button>

                <button onClick={() => setModalOpen("photo")}>
                    <i className="iconify mdi--camera size-8"/>
                </button>
                
            </div>
        </>
    )
}

function AssetsListTextItem({asset}: {asset: Asset}) {
    const [text, setText] = React.useState<string | null>(null);
    const [open, setOpen] = useState(false);
    React.useEffect(() => {
        async function fetchData() {
            const text = await asset.blob.text();
            setText(text);
        }
        fetchData();
    }, [asset]);

    if (text === null) {
        return null;
    }
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg border border-base-300 p-2 text-left hover:bg-base-200"
            >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-base-200">
                    <i className="iconify mdi--file-document size-8"></i>
                </div>  
                <div className="min-w-0 flex-1">
                    <div
                        className="truncate font-mono text-xs"
                        title={asset.path}
                    >
                        {asset.path}
                    </div>
                    <div className="text-[11px] opacity-60">
                        {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                    </div>
                </div>
            </button>
            {open && (
                createPortal(

                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setOpen(false)}
                    >   
                        <div
                            className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 rounded-xl bg-base-100 p-4"
                            onClick={(e) => e.stopPropagation()}    
                        >
                            <button
                                className="btn btn-sm btn-circle self-end"  
                                onClick={() => setOpen(false)}
                            >
                                ✕
                            </button>   
                            <div>
                                <div className="font-mono text-sm">
                                    {asset.path}
                                </div>
                                <div className="text-xs opacity-60">
                                    {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                                </div>
                            </div>
                            <pre className="max-h-80 overflow-auto rounded-lg bg-base-200 p-3 text-xs whitespace-pre-wrap">
                                {text}
                            </pre>
                        </div>
                    </div>,
                    document.body
                )
            )}
        </>
    )
}

type AudioAssetState = {
    text: string;
    url: string;
}

function AssetsListAudioItem({asset}: {asset: Asset}) {
    const [state, setState] = React.useState<AudioAssetState | null>(null);
    const [open, setOpen] = useState(false);
    React.useEffect(() => {
        async function fetchData() {
            const text = await blobText(asset.blob);
            const url = asset.blob.type.startsWith("text/") ? "" : URL.createObjectURL(asset.blob);
            setState({ text, url });
        }
        fetchData();
    }, [asset]);
    async function blobText(blob: Blob): Promise<string> {
        return blob.type.startsWith("text/") ? blob.text() : "";
    }
    if (!state) {
        return null;
    }
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg border border-base-300 p-2 text-left hover:bg-base-200"
            >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-base-200">
                    <i className="iconify mdi--music size-8"></i>
                </div>

                <div className="min-w-0 flex-1">
                    <div
                        className="truncate font-mono text-xs"
                        title={asset.path}
                    >
                        {asset.path}
                    </div>

                    <div className="text-[11px] opacity-60">
                        {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                    </div>
                </div>
            </button>

            {open && (
                createPortal(
                    
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setOpen(false)}
                    >
                        <div
                            className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 rounded-xl bg-base-100 p-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="btn btn-sm btn-circle self-end"
                                onClick={() => setOpen(false)}
                            >
                                <i className="iconify mdi--close size-4"></i>
                            </button>

                            <div>
                                <div className="font-mono text-sm">
                                    {asset.path}
                                </div>

                                <div className="text-xs opacity-60">
                                    {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                                </div>
                            </div>

                            {state.url && (
                                <audio
                                    src={state.url}
                                    controls
                                    className="w-full"
                                />
                            )}

                            {state.text && (
                                <div>
                                    <div className="mb-2 text-sm font-medium">
                                        Transcript
                                    </div>

                                    <pre className="max-h-80 overflow-auto rounded-lg bg-base-200 p-3 text-xs whitespace-pre-wrap">
                                        {state.text}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )
            )}
        </>
    )
}

type ImageAssetState = {
    url: string;
    exif: string
}

function AssetsListImageItem({asset}: {asset: Asset}) {
    const [state, setState] = React.useState<ImageAssetState | null>(null);
    const [open, setOpen] = useState(false);

    React.useEffect(() => {
        async function fetchData() {
            const url = URL.createObjectURL(asset.blob);
            const exif = await readExifSummary(asset.blob);
            setState({ url, exif });
        }
        fetchData();
    }, [asset]);

    if (!state) {
        return null;
    }

    return (
        <>
            {open && (
                createPortal(

                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setOpen(false)}
                    >
                        <div
                            className="flex max-h-[90vh] max-w-[90vw] flex-col gap-4 rounded-xl bg-base-100 p-4 relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="btn btn-sm btn-circle absolute top-2 right-2"
                                onClick={() => setOpen(false)}
                            >
                                <i className="iconify mdi--close size-5"/>
                            </button>

                            {state.url && (
                                <img
                                    src={state.url}
                                    alt={asset.path}
                                    className="max-h-[60vh] max-w-full object-contain"
                                />
                            )}

                            {state.exif && (
                                <pre className="max-h-60 overflow-auto rounded bg-base-200 p-3 text-xs whitespace-pre-wrap">
                                    {state.exif}
                                </pre>
                            )}
                        </div>
                    </div>,
                    document.body
                )
            )}
            <div
                key={asset.path}
                className="flex items-start gap-3 rounded-lg border border-base-300 p-2 cursor-pointer hover:bg-base-200"
                onClick={() => setOpen(true)}
            >
                {state.url && (
                    <img
                        src={state.url}
                        alt={asset.path}
                        className="h-14 w-14 shrink-0 rounded object-cover"
                    />
                )}

                <div className="min-w-0 flex-1">
                    <div
                        className="truncate font-mono text-xs"
                        title={asset.path}
                    >
                        {asset.path}
                    </div>

                    <div className="mt-0.5 text-[11px] opacity-60">
                        {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                    </div>
                </div>
            </div>
        </>
    );
}

// Render a resolved asset (bytes in hand) with the viewer that fits its MIME
// type. The MIME type is only known once the blob is downloaded, so this is
// reached from {@link AssetsListItem} after the user resolves the pointer.
function ResolvedAssetItem({asset}: {asset: Asset}) {
    return (
        (
            asset.type.startsWith("audio/") ?
                <AssetsListAudioItem asset={asset} />
            : asset.type.startsWith("video/") ? (
                <AssetsListAudioItem asset={asset} />
            )
            : asset.type.startsWith("image/") ? (
                <AssetsListImageItem asset={asset} />
            ) : asset.type.startsWith("text/") ? (
                <AssetsListTextItem asset={asset} />
            ) :
            (
                <div key={asset.path} className="flex w-full items-center gap-3 rounded-lg border border-base-300 p-2 text-left hover:bg-base-200">
                    <div className="font-mono text-sm">{asset.path}</div>
                    <div className="text-xs opacity-60">
                        {asset.type} · {(asset.size / 1024).toFixed(1)} KB
                    </div>
                </div>
            )
        )
    )
}

// A small icon class inferred from the file extension — all we can know about
// an asset before its bytes are downloaded (the GitLab tree listing carries
// neither MIME type nor size).
function iconForPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "mdi--image";
    if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "mdi--music";
    if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "mdi--video";
    if (["txt", "md", "csv", "json", "log"].includes(ext)) return "mdi--file-document";
    return "mdi--file";
}

// A single asset row. It starts as a pointer ({@link AssetRef}) and shows a
// download action; only when the user resolves it are the bytes fetched (cached
// after the first time) and handed to {@link ResolvedAssetItem} for display.
function AssetsListItem({assetRef}: {assetRef: AssetRef}) {
    const {getAsset, isAvailableLocally} = useNoteControllerContext();
    const [asset, setAsset] = React.useState<Asset | null>(null);
    // True until the initial presence check resolves: until then we don't know
    // whether the bytes are local, so we avoid flashing a "download" hint.
    const [checking, setChecking] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // On mount, if the bytes are already local (just captured, downloaded
    // before, or cached from an earlier load) resolve them straight away — the
    // same `getAsset` path, just served from cache, no network. Only a genuine
    // cache miss falls through to the download button.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            if (await isAvailableLocally(assetRef)) {
                const result = await getAsset(assetRef);
                if (!cancelled && result.success) setAsset((current) => current ?? result.value);
            }
            if (!cancelled) setChecking(false);
        })();
        return () => { cancelled = true; };
    }, [assetRef, isAvailableLocally, getAsset]);

    const load = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        const result = await getAsset(assetRef);
        setLoading(false);
        if (!result.success) {
            setError(result.error);
            return;
        }
        setAsset(result.value);
    };

    if (asset) return <ResolvedAssetItem asset={asset} />;

    const busy = checking || loading;
    return (
        <button
            type="button"
            onClick={load}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-lg border border-base-300 p-2 text-left hover:bg-base-200 cursor-pointer disabled:cursor-default disabled:opacity-60"
        >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-base-200">
                <i className={`iconify ${iconForPath(assetRef.path)} size-8`}></i>
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs" title={assetRef.path}>
                    {assetRef.name}
                </div>
                <div className="text-[11px] opacity-60">
                    {error
                        ? <span className="text-error">{error}</span>
                        : checking ? "Checking…" : "Tap to download"}
                </div>
            </div>
            {busy
                ? <span className="loading loading-spinner loading-sm"></span>
                : <i className="iconify mdi--download size-5 opacity-60"></i>}
        </button>
    );
}

/**
 * Button to open modal, displaying list of assets with metadata and display options, as well as option to delete assets. For photos, display metadata such as dimensions and file size, and display options such as "display full width" or "display as thumbnail". For audio recordings, display metadata such as duration and file size, and display options such as "display with audio player" or "display as download link"
 * @param param0 
 * @returns 
 */
function AssetsButton({note}: {note: Note}) {
    const [isOpen, setIsOpen] = React.useState(false);
    return (
        <>
            <BaseModal 
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
                title="Assets"
                classNames={{ modal: "modal-bottom" }}
            >
                <div className="flex flex-col gap-2">
                    {note.assets.length === 0 ? (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="text-2xl opacity-60">No assets found</div>
                            <div className="text-sm opacity-40">Add photos or audio recordings to your note using the buttons in the dock</div>
                        </div>
                    ) : note.assets.map(assetRef => (
                        <AssetsListItem key={assetRef.path} assetRef={assetRef} />
                    ))}
                </div>
            </BaseModal>
            <button 
                className="btn btn-square btn-secondary btn-sm gap-0 ml-auto"
                onClick={() => setIsOpen(true)}
                title="Assets"
                aria-label="Assets"
            >
                {note.assets.length > 0 && (
                    <span className="italic">{note.assets.length}</span>
                )}
                <i className="iconify mdi--paperclip size-5"/>
            </button>
        </>
    )
}


export default function NoteEditor() {
    const {activeNote, setActiveNote} = useActiveNoteContext();
    const {saveNote} = useNoteControllerContext();
    const [value, setValue] = React.useState<string>(activeNote ? activeNote.content : "");

    const handleOnChange = async (value_?: string) => {
        const value = value_ || "";
        setValue(value);
    }

    // Fold the editor's current text into the note before persisting it: the
    // edited markdown lives in `value`, while `activeNote` still holds the text
    // as it was loaded — saving `activeNote` as-is would drop every edit.
    const persist = (): Promise<Note> | null => {
        if (!activeNote) return null;
        activeNote.content = value;
        setActiveNote(activeNote);
        return saveNote(activeNote);
    }

    const handleBeforePageChange = () => {
        persist();
    }

    const handleBeforeSubmit: () => Promise<Result<Note>> = async () => {
        const saved = persist();
        if (!saved) {
            return { success: false, error: "No active note to save" };
        }
        return { success: true, value: await saved };
    }

    if (!activeNote) return (
        <div className="h-full flex items-center justify-center">
            <p className="text-lg text-neutral-content">No active note</p>
        </div>
    );
    return (
        <div className="h-full overflow-hidden flex flex-col">
            {/* Could be refactored into ActionBar component */}
            <div className="flex items-center gap-2 p-2">
                <BackButton targetPage="notes-browser" beforePageChange={handleBeforePageChange} />
                <h1 className="text-2xl font-bold truncate">{activeNote.title}</h1>
                <AssetsButton note={activeNote} />
                <SyncButton beforeSubmit={handleBeforeSubmit} mlAuto={false} />
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
                className="grow"
            />
            <Dock note={activeNote} setNote={setActiveNote} />
        </div>
    );
}