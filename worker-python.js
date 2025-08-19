// worker-python.js
// Runs Python (Pyodide) in a Worker with inline input.

let pyodide;
let inputBuffer = "";                 // last line received from page
const sab = new SharedArrayBuffer(4); // sync signal
const sig = new Int32Array(sab);

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'run') {
    await ensurePy();
    // rewire stdio each run
    pyodide.setStdout({ batched: s => postMessage({ type:'out', data: s }) });
    pyodide.setStderr({ batched: s => postMessage({ type:'out', data: s }) });
    pyodide.setStdin({
      stdin: () => {
        // wait until main thread sends a line via postMessage
        Atomics.store(sig, 0, 0);
        Atomics.wait(sig, 0, 0); // blocks worker thread until notified
        const s = inputBuffer;
        inputBuffer = "";
        return s;
      }
    });
    try {
      await pyodide.runPythonAsync(m.code);
    } catch (err) {
      postMessage({ type:'out', data: String(err) + "\n" });
    }
    postMessage({ type:'done' });
  } else if (m.type === 'stdin') {
    inputBuffer = m.data;        // a single line ending with '\n'
    Atomics.store(sig, 0, 1);
    Atomics.notify(sig, 0);
  }
};

async function ensurePy(){
  if (pyodide) return;
  // load pyodide in worker
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js");
  pyodide = await loadPyodide();
  postMessage({ type:'ready' });
}
