// worker-python.js — Pyodide in a Worker with true inline input
'use strict';

let pyodide;

// Shared buffers sent from the main page
let SIG;    // Int32Array(1) signal
let LEN;    // Int32Array(1) = number of bytes in BYTES to read
let BYTES;  // Uint8Array holding the UTF-8 line

self.onmessage = async (e) => {
  const m = e.data;

  // receive the shared buffers first
  if (m.type === 'init') {
    SIG   = new Int32Array(m.sig);          // 4-byte signal buffer
    const buf = m.data;                     // SharedArrayBuffer for data
    LEN   = new Int32Array(buf, 0, 1);      // first 4 bytes = length
    BYTES = new Uint8Array(buf, 4);         // rest = bytes
    postMessage({ type: 'inited' });
    return;
  }

  if (m.type === 'run') {
    await ensurePy();
    // write output immediately
    pyodide.setStdout({
  write: (s) => { postMessage({ type: 'out', data: s }); return s.length; }
});
pyodide.setStderr({
  write: (s) => { postMessage({ type: 'out', data: s }); return s.length; }
});

    // blocking stdin via Atomics
    pyodide.setStdin({
      stdin: () => {
        Atomics.store(SIG, 0, 0);           // go to sleep
        Atomics.wait(SIG, 0, 0);            // wake when main thread notifies
        const n = LEN[0] >>> 0;
        return new TextDecoder().decode(BYTES.subarray(0, n));
      }
    });

    try {
      await pyodide.runPythonAsync(m.code);
    } catch (err) {
      postMessage({ type: 'out', data: String(err) + '\n' });
    }
    postMessage({ type: 'done' });
    return;
  }
};

async function ensurePy() {
  if (pyodide) return;
  // If you self-host Pyodide, change to: importScripts('/vendor/pyodide/pyodide.js');
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
  pyodide = await loadPyodide();
  postMessage({ type: 'ready' });
}
