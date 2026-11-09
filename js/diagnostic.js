// A short code for an error, the same for the same message, so a student and the teacher can match them up.
export function diagnosticCode(error) {
  const text = String((error && (error.code || error.message)) || error || "unknown");
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `E-${hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}
