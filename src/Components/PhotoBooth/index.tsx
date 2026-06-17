import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Asset from "../../lib/domain/asset";
import type Note from "../../lib/domain/note";
import { embedExif, type GeoCoords } from "../../lib/exif";
import useErrorContext from "../../Contexts/ErrorContext";
import { useNoteControllerContext } from "../../Contexts/NoteControllerContext";

// Resolve the device's current location, or `null` if unavailable or denied.
// Never rejects, so a missing fix degrades to "no location" rather than an
// error the caller has to catch.
function getCurrentCoords(): Promise<GeoCoords | null> {
    if (!navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) =>
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    altitude: pos.coords.altitude,
                }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

type PhotoBoothProps = {
    // The note the photo is attached to. Its `assetsFolder` is the base
    // directory and the new Asset is added to it on accept.
    note: Note;
    // Called after the asset is built and added to the note, e.g. to persist
    // or to close a surrounding modal.
    onCapture?: (asset: Asset) => void;
    // Captured image MIME type. JPEG keeps photos small; PNG is lossless.
    mimeType?: "image/jpeg" | "image/png";
    // JPEG quality, 0–1. Ignored for PNG.
    quality?: number;
};

// A sensible default file name, distinct per capture so two photos in the
// same note don't collide.
function defaultFilename(mimeType: string): string {
    const ext = mimeType === "image/png" ? "png" : "jpg";
    return `photo-${Date.now()}.${ext}`;
}

/**
 * In-browser camera capture. Streams the device camera into a `<video>`,
 * grabs a still frame to a canvas, and turns it into an {@link Asset} placed
 * under the note's `assetsFolder`. Pure PWA — no upload, the bytes stay local
 * until the note is synced.
 */
export default function PhotoBooth({
    note,
    onCapture,
    mimeType = "image/jpeg",
    quality = 0.92,
}: PhotoBoothProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const {saveNoteObject} = useNoteControllerContext();
    const { setError } = useErrorContext();

    // The accepted-but-not-yet-saved still, as an object URL for preview.
    const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [filename, setFilename] = useState("");
    // "environment" = rear camera, "user" = front. Toggled by the flip button.
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
    // Whether to offer the flip button at all (false on single-camera devices).
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    // Whether to embed GPS coordinates in the photo's EXIF (JPEG only).
    const [tagLocation, setTagLocation] = useState(true);
    // True while encoding (geolocation lookup + EXIF), to disable the shutter.
    const [isCapturing, setIsCapturing] = useState(false);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const startCamera = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setError("This device or browser does not support camera access.");
            return;
        }
        setIsStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            // Only worth offering a flip control if more than one camera exists.
            // Labels are populated once permission is granted (just above).
            const devices = await navigator.mediaDevices.enumerateDevices();
            setHasMultipleCameras(devices.filter((d) => d.kind === "videoinput").length > 1);
        } catch {
            setError("Could not access the camera. Check your browser permissions.");
        } finally {
            setIsStarting(false);
        }
    }, [facingMode, setError]);

    // Toggle between front and rear cameras. The mount effect below restarts
    // the stream automatically when `facingMode` changes (via `startCamera`).
    const flipCamera = useCallback(() => {
        setFacingMode((mode) => (mode === "environment" ? "user" : "environment"));
    }, []);

    // Start on mount, and always release the camera on unmount.
    useEffect(() => {
        startCamera();
        return () => stopStream();
    }, [startCamera, stopStream]);

    // Revoke the preview object URL whenever it changes or unmounts.
    useEffect(() => {
        if (!preview) return;
        return () => URL.revokeObjectURL(preview.url);
    }, [preview]);

    const capture = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) {
            setError("The camera is not ready yet.");
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setError("Could not capture the photo.");
            return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        setIsCapturing(true);
        try {
            let blob: Blob | null;
            // EXIF only lives in JPEG; PNG output is stored verbatim, no metadata.
            if (mimeType === "image/jpeg") {
                const coords = tagLocation ? await getCurrentCoords() : null;
                if (tagLocation && !coords) {
                    setError("Could not read your location; the photo was kept without it.");
                }
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                const withExif = embedExif(dataUrl, {
                    takenAt: new Date(),
                    coords,
                    description: note.title,
                });
                blob = await (await fetch(withExif)).blob();
            } else {
                blob = await new Promise<Blob | null>((resolve) =>
                    canvas.toBlob(resolve, mimeType, quality)
                );
            }

            if (!blob) {
                setError("Could not encode the photo.");
                return;
            }

            // Freeze the preview; release the live camera while the user decides.
            // Pre-fill an editable, collision-free file name for this shot.
            stopStream();
            setFilename(defaultFilename(blob.type));
            setPreview({ url: URL.createObjectURL(blob), blob });
        } finally {
            setIsCapturing(false);
        }
    }, [mimeType, quality, tagLocation, note, setError, stopStream]);

    const retake = useCallback(() => {
        setPreview(null);
        startCamera();
    }, [startCamera]);

    const accept = useCallback(() => {
        if (!preview) return;
        const name = filename.trim();
        if (name.length === 0) {
            setError("Please enter a file name for the photo.");
            return;
        }

        const path = `${note.assetsFolder}/${name}`;
        const asset = Asset.create(path, preview.blob);
        if (!asset.success) {
            setError(asset.error);
            return;
        }

        const added = note.addAsset(asset.value);
        if (!added.success) {
            setError(added.error);
            return;
        }
        saveNoteObject(added.value);

        onCapture?.(asset.value);
        setPreview(null);
    }, [preview, filename, note, onCapture, setError, saveNoteObject]);

    // The folder shown read-only beside the editable file name.
    const folderHint = useMemo(() => `${note.assetsFolder}/`, [note]);

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="bg-base-300 rounded-box relative aspect-video w-full max-w-lg overflow-hidden">
                {preview ? (
                    <img src={preview.url} alt="Captured" className="h-full w-full object-contain" />
                ) : (
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                    />
                )}
                {isStarting && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="loading loading-spinner loading-lg" />
                    </div>
                )}
                {!preview && hasMultipleCameras && (
                    <button
                        className="btn btn-sm btn-circle btn-neutral absolute top-2 right-2"
                        onClick={flipCamera}
                        title="Switch camera"
                        aria-label="Switch camera"
                    >
                        <i className="iconify mdi--camera-flip-outline size-5" />
                    </button>
                )}
            </div>

            {preview ? (
                <div className="flex w-full max-w-lg flex-col gap-3">
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
                    <div className="flex justify-end gap-3">
                        <button className="btn btn-ghost" onClick={retake}>
                            <i className="iconify mdi--camera-retake-outline size-5" />
                            Retake
                        </button>
                        <button className="btn btn-primary" onClick={accept}>
                            <i className="iconify mdi--check size-5" />
                            Use photo
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    {mimeType === "image/jpeg" && (
                        <label className="label cursor-pointer gap-2">
                            <input
                                type="checkbox"
                                className="toggle toggle-sm"
                                checked={tagLocation}
                                onChange={(e) => setTagLocation(e.target.checked)}
                            />
                            <span className="label-text">Tag photo with location</span>
                        </label>
                    )}
                    <button
                        className="btn btn-primary btn-xl m-4"
                        onClick={capture}
                        disabled={isStarting || isCapturing}
                    >
                        <i className="iconify mdi--camera size-6" />
                        {isCapturing ? "Capturing…" : "Take picture"}
                    </button>
                </div>
            )}
        </div>
    );
}
