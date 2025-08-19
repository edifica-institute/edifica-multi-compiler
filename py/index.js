// /py/index.js — Python-only page
// Requirements:
// 1) /py/ must be cross-origin isolated (COEP on) so SharedArrayBuffer exists.
// 2) worker file at /py/worker-python.js (loads Pyodide with importScripts).
// 3) HTML elements present: #lang, #code, #run, #term, #line, #status

'use strict';

// ---- DOM ----
const code   = document.getElementById('code');
const term   = document.getElementById('term');
const line   = document.getElementById('line');
const status = document.getElementById('status');
const lang   = document.getElementById('lang');

// default template
code.value = `print("enter ", end="")\nx = int(input())\nprint("You typed:", x)`;

// guard: this page *must* be isolated
const supportsSAB = (typeof SharedArrayBuffer !== 'undefined') && window.crossOriginIsolated;
if (!supportsSAB) {
  term.textContent = "This Python page needs cross-origin isolation (COEP).";
  throw new Error("SharedArrayBuffer not available on /py/");
}

// ---- Python worker (Pyodide) ----
let pyWorker = null;
let pyReady  = false;

const sigBuf  = new SharedArrayBuffer(4);
const SIG     = new Int32Array(sigBuf);
const dataBuf = new SharedArrayBuffer(65536);
const LEN     = new Int32Array(dataBuf, 0, 1);
const BYTES   = new Uint8Array(dataBuf, 4);

function ensurePyWorker() {
  if (pyWorker) return;
  pyWorker = new Worker('worker-python.js');
  pyWorker.postMessage({ type: 'init', sig: sigBuf, data: dataBuf });
  pyWorker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') { pyReady = true; status.textContent = 'Python ready'; }
    if (m.type === 'out')   { term.textContent += m.data; }
    if (m.type === 'done')  { status.textContent = 'Done'; activeDeliver = null; }
  };
  pyWorker.onerror = (e) => { console.error('Worker error', e); status.textContent = 'Worker error'; };
}

function deliverToPython(lineStr) {
  const bytes = new TextEncoder().encode(lineStr);
  const n = Math.min(bytes.length, BYTES.length);
  BYTES.set(bytes.subarray(0, n));
  LEN[0] = n;
  Atomics.store(SIG, 0, 1);
  Atomics.notify(SIG, 0);
}

// ---- shared input routing ----
let activeDeliver = null;
line.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const s = line.value + '\n';
    line.value = '';
    term.textContent += s;            // echo like a console
    if (activeDeliver) activeDeliver(s);
  }
});

// ---- Run button ----
document.getElementById('run').addEventListener('click', async () => {
  if (lang && lang.value !== 'python') {
    // if user switches dropdown, bounce them back to the root page
    location.href = '/';
    return;
  }
  term.textContent = '';
  status.textContent = pyReady ? 'Running…' : 'Loading Python… (first time ~10MB)';
  ensurePyWorker();
  activeDeliver = deliverToPython;
  pyWorker.postMessage({ type: 'run', code: code.value });
});
