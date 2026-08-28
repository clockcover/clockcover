// CSV upload bodies are capped: by content-length up front, and again after reading,
// since the header is optional and a client may lie.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The body as text, or null when it is larger than `max` bytes. */
export async function readCappedText(req: Request, max = MAX_UPLOAD_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > max) return null;
  return new TextDecoder().decode(bytes);
}
