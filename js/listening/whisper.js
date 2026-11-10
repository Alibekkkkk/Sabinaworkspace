// Speech-to-text in the teacher's browser with Whisper (Transformers.js, MIT licence; Whisper model weights, MIT licence).
// Nothing is sent to a server: the model is downloaded once from Hugging Face, cached by the browser, and runs locally.
// Used only by tools/listening-recording.html, whose security policy allows the library and model hosts.
export const LIBRARY_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";
export const MODELS = Object.freeze({
  fast: { id: "Xenova/whisper-tiny.en", label: "Fast (about 40 MB download, good for clear speech)" },
  accurate: { id: "Xenova/whisper-base.en", label: "More accurate (about 80 MB download, slower)" }
});
export const SAMPLE_RATE = 16000;

const loaded = new Map();

// reportProgress(percent 0..100, message): download progress across the model's files.
export async function loadTranscriber(quality = "accurate", reportProgress = () => {}) {
  const model = MODELS[quality] || MODELS.accurate;
  if (loaded.has(model.id)) return loaded.get(model.id);
  reportProgress(0, "Loading the speech-recognition library…");
  const library = await import(LIBRARY_URL);
  library.env.allowLocalModels = false;
  const files = new Map();
  const promise = library.pipeline("automatic-speech-recognition", model.id, {
    progress_callback: event => {
      if (event.status === "progress" && event.file) files.set(event.file, { loaded: event.loaded || 0, total: event.total || 0 });
      if (event.status === "done" && event.file && files.has(event.file)) { const file = files.get(event.file); files.set(event.file, { loaded: file.total, total: file.total }); }
      const totals = [...files.values()].reduce((sum, file) => ({ loaded: sum.loaded + file.loaded, total: sum.total + file.total }), { loaded: 0, total: 0 });
      if (totals.total) reportProgress(Math.min(100, Math.round((totals.loaded / totals.total) * 100)), `Downloading the model (first time only): ${Math.round(totals.loaded / 1048576)} of ${Math.round(totals.total / 1048576)} MB`);
    }
  });
  loaded.set(model.id, promise);
  try { return await promise; } catch (error) { loaded.delete(model.id); throw error; }
}

// Any audio file the browser can decode -> 16 kHz mono samples and the duration in seconds.
export async function decodeAudio(arrayBuffer) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("This browser cannot decode audio. Use a current Chrome, Edge, Firefox or Safari.");
  const probe = new OfflineContext(1, 1, SAMPLE_RATE);
  let decoded;
  try { decoded = await probe.decodeAudioData(arrayBuffer.slice(0)); } catch { throw new Error("The file could not be read as audio. Use an mp3, m4a, wav or ogg file."); }
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const context = new OfflineContext(1, length, SAMPLE_RATE);
  const source = context.createBufferSource(); source.buffer = decoded; source.connect(context.destination); source.start();
  const rendered = await context.startRendering();
  return { samples: rendered.getChannelData(0), duration: decoded.duration };
}

// Fetches an audio link. Fails with a clear message when the server does not allow other sites to read the file (CORS).
export async function fetchAudio(url) {
  let response;
  try { response = await fetch(url, { mode: "cors", credentials: "omit" }); }
  catch { throw new Error("The browser was not allowed to read this file (the website does not share it with other sites). Download the audio and use “Choose a file” instead; students will still play it from the link."); }
  if (!response.ok) throw new Error(`The link answered ${response.status}. Check that it opens the audio file directly.`);
  const type = response.headers.get("content-type") || "";
  if (/text\/html/i.test(type)) throw new Error("The link opens a web page, not an audio file.");
  return response.arrayBuffer();
}

// samples -> Whisper chunks [{ text, timestamp: [start, end] }]. Long recordings are read in 30-second windows.
export async function transcribe(transcriber, samples) {
  const result = await transcriber(samples, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  return Array.isArray(result.chunks) && result.chunks.length ? result.chunks : [{ text: result.text || "", timestamp: [0, samples.length / SAMPLE_RATE] }];
}
