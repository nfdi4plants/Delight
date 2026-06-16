// A thin, typed wrapper over the Web Speech API (`SpeechRecognition` /
// `webkitSpeechRecognition`), which isn't part of the standard DOM lib types.
// It is Chrome/Edge-only in practice (Firefox has none; Safari is partial), so
// every entry point feature-detects and degrades to "no transcription".

// ── Minimal structural types for the bits we use ───────────────────────
type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = { isFinal: boolean; 0: SpeechAlternativeLike };
type SpeechResultListLike = { length: number; [index: number]: SpeechResultLike };
type SpeechResultEventLike = { resultIndex: number; results: SpeechResultListLike };
type SpeechErrorEventLike = { error: string };

interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechResultEventLike) => void) | null;
    onerror: ((event: SpeechErrorEventLike) => void) | null;
    onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether live transcription is available in this browser. */
export function isTranscriptionSupported(): boolean {
    return getRecognitionCtor() !== null;
}

export type Transcriber = {
    start: () => void;
    stop: () => void;
};

type TranscriberOptions = {
    /** BCP-47 language tag; defaults to the browser language. */
    lang?: string;
    /** Called on every update with the finalized text plus the in-flight guess. */
    onUpdate: (finalText: string, interimText: string) => void;
    /** Called once if recognition is permanently unavailable mid-session. */
    onError?: (error: string) => void;
};

/**
 * Build a continuous transcriber, or `null` if the browser has no Speech API.
 * Recognition naturally ends after a pause, so we restart it until `stop()` is
 * called — that keeps a long memo with silences transcribing to the end.
 */
export function createTranscriber(opts: TranscriberOptions): Transcriber | null {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = opts.lang ?? navigator.language ?? "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = "";
    let stopped = false;

    recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            if (result.isFinal) finalText += transcript;
            else interim += transcript;
        }
        opts.onUpdate(finalText.trim(), interim.trim());
    };

    recognition.onerror = (event) => {
        // Permission/hardware failures won't recover by restarting — give up.
        if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed" ||
            event.error === "audio-capture"
        ) {
            stopped = true;
            opts.onError?.(event.error);
        }
    };

    recognition.onend = () => {
        if (!stopped) {
            try {
                recognition.start();
            } catch {
                // Already starting/started — ignore.
            }
        }
    };

    return {
        start: () => {
            stopped = false;
            try {
                recognition.start();
            } catch {
                // Ignore "already started".
            }
        },
        stop: () => {
            stopped = true;
            try {
                recognition.stop();
            } catch {
                // Ignore "not started".
            }
        },
    };
}
