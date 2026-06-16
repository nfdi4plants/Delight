const NotesBasePath = "notes"

/// iso yyyy-mm-dd , then a dash, then the note title, then optional .md
export const NoteFileNamePattern = /^\d{4}-\d{2}-\d{2}-[A-z0-9\-]+(\.md)?$/

export const NotesTitlePattern = /^[A-z0-9\-]+(\.md)?$/

export function verifyNoteFileName(noteName: string) {
    return NoteFileNamePattern.test(noteName)
}

export function verifyNoteTitle(noteTitle: string) {
    return NotesTitlePattern.test(noteTitle)
}

export function getNotesPath(noteTitle: string) {
    const noteTitleTrimmed = noteTitle.trim()
    const now = new Date()
    const isValidTitle = verifyNoteTitle(noteTitleTrimmed)
    if (!isValidTitle) {
        throw new Error("Invalid note title. Note titles must be alphanumeric, can only contain letters, numbers and dashes.")
    }
    const yyyymmdd = now.toISOString().split("T")[0]
    const trimmedMdTitle = noteTitleTrimmed.endsWith(".md") ? noteTitleTrimmed.slice(0, -3) : noteTitleTrimmed
    const fileName = `${yyyymmdd}-${trimmedMdTitle}.md`
    if (!verifyNoteFileName(fileName)) {
        throw new Error("Generated note file name is invalid. This is likely a bug, please report it.")
    }
    return `${NotesBasePath}/${fileName}`
}