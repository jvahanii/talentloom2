// CV and cover-letter file types. Uploads are stored with the content type
// from this list, never the one the browser reports, and the storage bucket
// accepts only these, so a file named .pdf can't be served as a web page.
const DOCUMENT_TYPES: Record<string, { contentType: string; magic: number[] }> = {
  pdf: { contentType: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
  // Old Word files are OLE compound documents.
  doc: { contentType: "application/msword", magic: [0xd0, 0xcf, 0x11, 0xe0] },
  // .docx is a zip archive.
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
};

function extOf(fileName: string) {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

export function documentContentType(fileName: string): string {
  return DOCUMENT_TYPES[extOf(fileName)]?.contentType ?? "application/octet-stream";
}

/** An error message when the bytes aren't a PDF/DOC/DOCX matching the name. */
export function documentProblem(fileName: string, bytes: Uint8Array): string | null {
  const type = DOCUMENT_TYPES[extOf(fileName)];
  if (!type) return "Only PDF, DOC or DOCX files are accepted.";
  if (!type.magic.every((b, i) => bytes[i] === b))
    return `${fileName} doesn't look like a real ${extOf(fileName).toUpperCase()} file.`;
  return null;
}
