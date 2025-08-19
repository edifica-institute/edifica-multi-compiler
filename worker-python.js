// worker-python.js — Pyodide in a Worker with true inline input
let pyodide;

// Shared buffers (filled by the main page)
let SIG = null;      // Int32Array(1)
let LEN = null;      // Int32Array(1) lives at offset 0 of DATA
let BYTES = null;    // Uint8Array view of DATA after the first 4 bytes

self.onmessage = async (e) => {
  const m = e.data;

  // Receive the shared buffers from the main thread
  if (m.type === 'init') {
    SIG = new Int32Array(m.sig);             // 4-byte signal
    const DATA = new SharedArrayBuffer(m.data.byteLength); // not used; we only need the views:
    // Use the passed buffer directly (no copy)
    const buf = m.data;
    LEN   = new Int32Array(buf, 0, 1);       // first 4 bytes = length
    BYTES = new Uint8Array(buf, 4);          // rest = utf-8 bytes
    postMessage({ type:'inited' });
    return;
  }

  if (m.type === 'run') {
    await ensurePy();
    // Flush every write immediately (so "enter " appears before input)
    pyodide.setStdout({ write: s => postMessage({ type:'out', data: s }) });
    pyodide.setStderr({ write: s => postMessage({ type:'out', data: s }) });

    // Block for input using Atomics on the shared signal & read bytes from BYTES
    pyodide.setStdin({
      stdin: () => {
        Atomics.store(SIG, 0, 0);           // go to sleep
        Atomics.wait(SIG, 0, 0);            // woken up by main page
        const n = LEN[0] >>> 0;
        const text = new TextDecoder().decode(BYTES.slice(0, n));
        return text;
      }
    });

    try {
      await pyodide.runPythonAsync(m.code);
    } catch (err) {
      postMessage({ type:'out', data: String(err) + "\n" });
    }
    postMessage({ type:'done' });
    return;
  }
};

async function ensurePy() {
  if (pyodide) return;
  // If you self-host Pyodide, change this path to /vendor/pyodide/pyodide.js
  importScripts("https://cdn.jsdelivr.n
