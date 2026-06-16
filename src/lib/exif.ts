import piexif from "piexifjs";

/** Decimal-degree location, optionally with altitude in metres. */
export type GeoCoords = {
    latitude: number;
    longitude: number;
    altitude?: number | null;
};

export type ExifMeta = {
    /** When the photo was taken; used for the date tags and GPS timestamp. */
    takenAt: Date;
    /** GPS location, omitted/null to embed no location. */
    coords?: GeoCoords | null;
    /** Producing software, e.g. "Delight". */
    software?: string;
    /** Free-text description, e.g. the note title. */
    description?: string;
};

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

// EXIF date/time is "YYYY:MM:DD HH:MM:SS" in *local* time with no zone.
function formatExifDateTime(d: Date): string {
    return (
        `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
}

/**
 * Return a copy of a base64 JPEG data URL with EXIF metadata embedded: the
 * capture date/time, the producing software, an optional description and —
 * when supplied — GPS coordinates. JPEG only: `<canvas>` output carries no
 * EXIF at all, so this injects a fresh block rather than editing one.
 */
export function embedExif(jpegDataUrl: string, meta: ExifMeta): string {
    const zeroth: Record<number, unknown> = {};
    const exif: Record<number, unknown> = {};
    const gps: Record<number, unknown> = {};

    const dateTime = formatExifDateTime(meta.takenAt);
    zeroth[piexif.ImageIFD.DateTime] = dateTime;
    zeroth[piexif.ImageIFD.Software] = meta.software ?? "Delight";
    zeroth[piexif.ImageIFD.Orientation] = 1; // canvas pixels are already upright
    if (meta.description) zeroth[piexif.ImageIFD.ImageDescription] = meta.description;

    exif[piexif.ExifIFD.DateTimeOriginal] = dateTime;
    exif[piexif.ExifIFD.DateTimeDigitized] = dateTime;

    const coords = meta.coords;
    if (coords) {
        const { latitude, longitude, altitude } = coords;
        gps[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? "N" : "S";
        gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(latitude));
        gps[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? "E" : "W";
        gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(longitude));

        if (altitude != null && !Number.isNaN(altitude)) {
            gps[piexif.GPSIFD.GPSAltitudeRef] = altitude < 0 ? 1 : 0; // 0 = above sea level
            gps[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(altitude) * 100), 100];
        }

        // GPS timestamp is UTC: a date stamp plus an h/m/s rational time.
        const t = meta.takenAt;
        gps[piexif.GPSIFD.GPSDateStamp] =
            `${t.getUTCFullYear()}:${pad(t.getUTCMonth() + 1)}:${pad(t.getUTCDate())}`;
        gps[piexif.GPSIFD.GPSTimeStamp] = [
            [t.getUTCHours(), 1],
            [t.getUTCMinutes(), 1],
            [t.getUTCSeconds(), 1],
        ];
    }

    const exifBytes = piexif.dump({ "0th": zeroth, Exif: exif, GPS: gps });
    return piexif.insert(exifBytes, jpegDataUrl);
}
