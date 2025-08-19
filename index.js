// /index.js — Java + HTML, HTML+CSS, SQL, JS (root page)
// Root page MUST NOT enable COEP. If user picks Python, redirect to /py/.

'use strict';

// ---- DOM ----
const lang     = document.getElementById('lang');
const code     = document.getElementById('code');
const term     = document.getElementById('term');
const line     = document.getElementById('line');
const statusEl = document.getElementById('status');

const webBox   = document.getElementById('webEditors'); // shown for HTML+CSS
const htmlEl   = document.getElementById('html');
const cssEl    = document.getElementById('css');
const iframe   = document.getElementById('preview');

// ---- Templates ----
const TPL = {
  java: `import java.util.*; class Main {
  public static void main(String[] args){
    Scanner sc = new Scanner(System.in);
    System.out.print("enter ");
    int x = sc.nextInt();
    System.out.println("You typed: " + x);
  }
}`,
  html_only: `<!DOCTYPE html>
<h1>Hello, HTML</h1>
<p>Edit and Run to preview.</p>`,
  html_css_html: `<!DOCTYPE html>
<h1>Hello</h1>
<p>This is HTML + CSS mode.</p>`,
  html_css_css: `body{font:16px system-ui;padding:20px} h1{color:#2a6}`,
  sql: `CREATE TABLE t(id INTEGER);
INSERT INTO t VALUES (1),(2),(3);
SELECT COUNT(*) AS cnt FROM t;`,
  js: `// Example
console.log("Hello from JS");
const name = prompt("enter your name");
console.log("Hi, " + name);`
};

// ---- Mode switching (including Python redirect) ----
function setMode(v) {
  term.textContent = '';
  statusEl.textContent = '';
  if (v === 'html_css') {
    if (webBox) webBox.style.display = 'block';
    if (code)   code.style.display   = 'none';
    if (iframe) iframe.parentElement.style.display = 'block';
    if (htmlEl && cssEl) {
      htmlEl.value = TPL.html_css_html;
      cssEl.value  = TPL.html_css_css;
    }
  } else {
    if (webBox) webBox.style.display = 'none';
    if (iframe) iframe.parentElement.style.display = 'none';
    if (code)   code.style.display   = 'block';
    if (code)   code.value = TPL[v] || '';
  }
}
setMode(lang.value);

lang.addEventListener('change', () => {
  const v = lang.value;
  if (v === 'python') { location.href = '/py/'; return; }   // Python lives under /py/
  setMode(v);
});

// --------------------------------------------------------------------
//                               SQL
// --------------------------------------------------------------------
let SQL_READY = false;
let SQL_API   = null;
let db        = null;

async function ensureSQL() {
  if (!window.initSqlJs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
      s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = () => reject(new Error('sql-wasm.js failed'));
      document.head.appendChild(s);
    });
  }
  if (!SQL_READY) {
    SQL_API = await window.initSqlJs({
      locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
    });
    SQL_READY = true;
  }
  db = new SQL_API.Database();
}

async function runSQL(sql) {
  await ensureSQL();
  try {
    const res = db.exec(sql); // [{columns, values}]
    if (!res.length) { term.textContent = '(ok)\n'; return; }
    res.forEach(tbl => {
      const header = tbl.columns.join(' | ');
      term.textContent += header + '\n' + '-'.repeat(header.length) + '\n';
      tbl.values.forEach(row => term.textContent += row.join(' | ') + '\n');
      term.textContent += '\n';
    });
  } catch (e) {
    term.textContent += String(e) + '\n';
  }
}

// --------------------------------------------------------------------
//                               Java
// --------------------------------------------------------------------
// CheerpJ loader must be present in <head> via:
// <script src="https://cjrtnc.leaningtech.com/4.2/loader.js"></script>
// ------------------------------ Java (CheerpJ + ECJ) ------------------------------
const ECJ_LOCAL_URL = '/ecj.jar'; // change to '/libs/ecj.jar' if you put it in /libs

let cjBooted = false;
async function ensureCheerpJ() {
  if (!window.cheerpjInit) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cjrtnc.leaningtech.com/4.2/loader.js';
      s.onload = resolve; s.onerror = () => reject(new Error('CheerpJ loader failed'));
      document.head.appendChild(s);
    });
  }
  if (!cjBooted) { await window.cheerpjInit(); cjBooted = true; }
}

// Mount ecj.jar into CheerpJ’s FS to avoid Range requests
let ecjMounted = false;
async function ensureECJMounted() {
  if (ecjMounted) return;
  const res = await fetch(ECJ_LOCAL_URL);
  if (!res.ok) throw new Error('ECJ fetch failed: ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Put the jar into /str; CheerpJ can read it from there
  window.cheerpOSAddBufferFile('/str/ecj.jar', buf);
  ecjMounted = true;
}

const RUNNER_SRC = `
import java.io.*; import java.nio.charset.StandardCharsets; import java.nio.file.*; import java.lang.reflect.*;
public class Runner {
  public static void main(String[] args) throws Exception {
    String mainClass = args.length>0 ? args[0] : "Main";
    byte[] inBytes = new byte[0];
    try { inBytes = Files.readAllBytes(Paths.get("/str/stdin.txt")); } catch (IOException ignore) {}
    InputStream oldIn = System.in; PrintStream oldOut = System.out, oldErr = System.err;
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    PrintStream cap = new PrintStream(buf, true, "UTF-8");
    System.setIn(new ByteArrayInputStream(inBytes)); System.setOut(cap); System.setErr(cap);
    int exit = 0;
    try { Class<?> c = Class.forName(mainClass);
          c.getMethod("main", String[].class).invoke(null, (Object)new String[0]);
    } catch (Throwable t) {
      if (t instanceof InvocationTargetException && t.getCause()!=null) t.getCause().printStackTrace();
      else t.printStackTrace(); exit = 1;
    } finally {
      System.setIn(oldIn); System.setOut(oldOut); System.setErr(oldErr);
      Files.write(Paths.get("/str/stdout.txt"), buf.toString("UTF-8").getBytes(StandardCharsets.UTF_8));
      Files.write(Paths.get("/str/exitcode.txt"), String.valueOf(exit).getBytes(StandardCharsets.UTF_8));
    }
  }
}`;

// Batch-stdin: collect lines before Run (unchanged)
let javaInputLines = [];
line.addEventListener('keydown', (e) => {
  if (lang.value === 'java' && e.key === 'Enter') {
    const s = line.value; line.value = '';
    javaInputLines.push(s);
    term.textContent += s + '\n';
    e.preventDefault();
  }
});

async function runJava(javaSrc, stdinText) {
  await ensureCheerpJ();
  await ensureECJMounted();

  window.cheerpOSAddStringFile('/str/Main.java',   javaSrc);
  window.cheerpOSAddStringFile('/str/Runner.java', RUNNER_SRC);
  window.cheerpOSAddStringFile('/str/stdin.txt',   stdinText || '');

  // NOTE: classpath now points to the mounted /str/ecj.jar (no Range needed)
  const compileExit = await window.cheerpjRunMain(
    'org.eclipse.jdt.internal.compiler.batch.Main',
    '/str/ecj.jar', '-d', '/str/classes', '/str/Runner.java', '/str/Main.java'
  );
  if (compileExit !== 0) {
    term.textContent += '(Compilation failed — check Console for ECJ messages)\n';
    return;
  }

  const runExit = await window.cheerpjRunMain('Runner', '/str/classes', 'Main');
  const out = await (await window.cjFileBlob('/str/stdout.txt')).text();
  term.textContent += out;
  if (runExit !== 0) statusEl.textContent = 'Error';
}


// --------------------------------------------------------------------
//                               JS
// --------------------------------------------------------------------
function runJavaScript(js) {
  // capture console.log
  const orig = console.log;
  console.log = (...a) => { term.textContent += a.join(' ') + '\n'; orig.apply(console, a); };
  try { (0, eval)(js); } catch (e) { term.textContent += String(e) + '\n'; }
  console.log = orig;
}

// --------------------------------------------------------------------
//                               HTML / HTML+CSS
// --------------------------------------------------------------------
function renderHTMLOnly(html) {
  if (!iframe) return;
  iframe.parentElement.style.display = 'block';
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

function renderHTMLCSS(html, css) {
  if (!iframe) return;
  iframe.parentElement.style.display = 'block';
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;
}

// --------------------------------------------------------------------
//                          RUN button
// --------------------------------------------------------------------
document.getElementById('run').addEventListener('click', async () => {
  const v = lang.value;
  term.textContent = '';
  statusEl.textContent = 'Running…';

  if (v === 'java') {
    await runJava(code.value, javaInputLines.join('\n'));
    statusEl.textContent = 'Done';
    javaInputLines = [];
    return;
  }

  if (v === 'sql') {
    await runSQL(code.value);
    statusEl.textContent = 'Done';
    return;
  }

  if (v === 'js') {
    runJavaScript(code.value);
    statusEl.textContent = 'Done';
    return;
  }

  if (v === 'html_only') {
    renderHTMLOnly(code.value);
    statusEl.textContent = 'Rendered';
    return;
  }

  if (v === 'html_css') {
    const htmlSrc = htmlEl ? htmlEl.value : '';
    const cssSrc  = cssEl  ? cssEl.value  : '';
    renderHTMLCSS(htmlSrc, cssSrc);
    statusEl.textContent = 'Rendered';
    return;
  }

  if (v === 'python') {
    location.href = '/py/'; // safety: Python lives on isolated path
  }
});
