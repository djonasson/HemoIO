// PDF.js ships no types for its worker module, which the match-reports
// runner imports to run the worker in Node's own thread
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  /** The worker's message handler, which PDF.js looks up on globalThis.pdfjsWorker */
  export const WorkerMessageHandler: unknown;
}
