// Cloudflare Pages Function: /api/run  (POST + CORS preflight)
// Proxies to Judge0 CE and polls until the result is ready.

const JUDGE0 = "https://ce.judge0.com";

let cachedLangs = null;
async function getLanguages() {
  if (cachedLangs) return cachedLangs;
  const r = await fetch(`${JUDGE0}/languages`);
  cachedLangs = await r.json(); // [{id, name}, ...]
  return cachedLangs;
}

// Map UI keys -> Judge0 language name patterns
const MATCHERS = {
  java:        ["Java ("],
  c:           ["C (GCC "],
  cpp:         ["C++ (GCC "],
  python:      ["Python ("],
  sql:         ["SQL (SQLite"],
  csharp:      ["C# ("],
  vb:          ["Visual Basic.Net"],
  javascript:  ["JavaScript (Node.js"]
};
function findLanguageId(langs, key){
  const needles = MATCHERS[key] || [];
  for (const n of needles){
    const hit = langs.find(l => l.name.includes(n));
    if (hit) return hit.id;
  }
  return null;
}

async function createSubmission(payload){
  const r = await fetch(`${JUDGE0}/submissions?base64_encoded=false&wait=false`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Judge0 create failed: ${r.status}`);
  return r.json(); // { token }
}
async function getSubmission(token){
  const fields = "stdout,stderr,compile_output,status_id,time,memory";
  const r = await fetch(`${JUDGE0}/submissions/${token}?base64_encoded=false&fields=${fields}`);
  if (!r.ok) throw new Error(`Judge0 get failed: ${r.status}`);
  return r.json();
}

// CORS helper
function cors(json, status=200){
  return new Response(JSON.stringify(json), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

export async function onRequestPost({ request }) {
  try {
    const { language, source_code, stdin } = await request.json();
    if (!language || !source_code) return cors({ error: "Missing `language` or `source_code`" }, 400);

    const langs = await getLanguages();
    const language_id = findLanguageId(langs, language);
    if (!language_id) return cors({ error: `Unsupported language: ${language}` }, 400);

    const { token } = await createSubmission({ language_id, source_code, stdin: stdin || "" });

    // Poll until done (status_id >= 3) or ~8s
    const start = Date.now();
    let result = null;
    while (Date.now() - start < 8000) {
      result = await getSubmission(token);
      if (result.status_id >= 3) break;
      await new Promise(r => setTimeout(r, 300));
    }

    return cors({
      stdout: result?.stdout || "",
      stderr: (result?.compile_output || "") + (result?.stderr || ""),
      time: result?.time ?? null,
      memory: result?.memory ?? null,
      status_id: result?.status_id ?? null
    });
  } catch (e) {
    return cors({ error: e.message || String(e) }, 500);
  }
}
