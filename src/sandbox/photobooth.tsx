// Standalone dev harness for the PhotoBooth component. It mounts PhotoBooth on
// a throwaway in-memory Note — no auth, no repository, no saving — so the
// camera/capture flow can be exercised in isolation from the rest of the app.
//
// Run `npm run dev` and open `/Delight/photobooth.html`.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import piexif from "piexifjs";
import "../index.css";
import "../tailwind.css";
import ErrorContextProvider from "../Components/Provider/ErrorContextProvider";
import PhotoBooth from "../Components/PhotoBooth";
import Note from "../lib/domain/note";
import type Asset from "../lib/domain/asset";

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

// A mock note to attach captures to. Its `assetsFolder` drives PhotoBooth's
// paths; nothing is persisted.
const mockNoteResult = Note.create("Sandbox Note", "sandbox-note", "");
if (!mockNoteResult.success) throw new Error(mockNoteResult.error);
const mockNote = mockNoteResult.value;

function Sandbox() {
    // Keep a preview URL per captured asset so we can render them inline.
    const [shots, setShots] = useState<{ asset: Asset; url: string; exif: string }[]>([]);

    const handleCapture = async (asset: Asset) => {
        const exif = await readExifSummary(asset.blob);
        setShots((prev) => [
            { asset, url: URL.createObjectURL(asset.blob), exif },
            ...prev,
        ]);
    };

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
            <div>
                <h1 className="text-2xl font-bold">PhotoBooth sandbox</h1>
                <p className="text-sm opacity-60">
                    Mock note assets folder: <code>{mockNote.assetsFolder}</code>
                </p>
            </div>

            <PhotoBooth note={mockNote} onCapture={handleCapture} />

            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">
                    Captured assets ({shots.length})
                </h2>
                {shots.length === 0 ? (
                    <p className="text-sm opacity-50">Nothing captured yet.</p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {shots.map(({ asset, url, exif }) => (
                            <li key={asset.path} className="flex items-center gap-3">
                                <img
                                    src={url}
                                    alt={asset.basename}
                                    className="bg-base-300 h-16 w-16 rounded object-cover"
                                />
                                <div className="text-sm">
                                    <div className="font-mono">{asset.path}</div>
                                    <div className="opacity-60">
                                        {asset.type} · {(asset.size / 1024).toFixed(1)} KB ·
                                        onServer={String(asset.isOnServer)}
                                    </div>
                                    <div className="font-mono text-xs opacity-50">{exif}</div>
                                </div>
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
