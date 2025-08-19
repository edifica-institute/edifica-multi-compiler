// worker-python.js — Pyodide in a Worker with true inline input
'use strict';

let pyodide;

// Shared buffers from the main page
let SIG;    // Int32Array(1) signal
let LEN;    // Int32Array(1) = number of bytes to read
let BYTES;  // Uint8Array holding the UTF-8 line

self.onmessage = async (e) => {
  const m = e.data;

  if (m.type === 'init') {
    SIG   = new Int32Array(m.sig);
    const buf = m.data;
    LEN   = new Int32Array(buf, 0, 1);
    BYTES = new Uint8Array(buf, 4);
    postMessage({ type: 'inited' });
    return;
  }

  if (m.type === 'run') {
    await ensurePy();

    // MUST return the number of chars written
    pyodide.setStdout({ write: s => { postMessage({ type:'out', data:s }); return s.length; } });
    pyodide.setStderr({ write: s => { postMessage({ type:'out', data:s }); return s.length; } });

    pyodide.setStdin({
      stdin: () => {
        Atomics.store(SIG, 0, 0);
        Atomics.wait(SIG, 0, 0);
        const n = LEN[0] >>> 0;
        return new TextDecoder().decode(BYTES.subarray(0, n));
      }
    });

    try {
      await pyodide.runPythonAsync(m.code);
    } catch (err) {
      postMessage({ type:'out', data: String(err) + '\n' });
    }
    postMessage({ type:'done' });
  }
};

async function ensurePy() {
  if (pyodide) return;
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
  pyodide = await loadPyodide();
  postMessage({ type:'ready' });
}
