// api/run.js  (Vercel/Netlify-style serverless function)
// Node 18+
// No secrets needed for the public CE demo host; for production use a hosted plan + key.

const JUDGE0 = "https://ce.judge0.com";

let cachedLangs = null;
async function fetchLanguages() {
  if (cachedLangs) return cachedLangs;
  const r = await fetch(`${JUDGE0}/languages`);
  cachedLangs = await r.json(); // [{id, name}, ...]
  return cachedLangs;
}

// Map our UI keys to a substring match in Judge0's language names
const MATCHERS = {
  java:        ["Java ("],                  // e.g., "Java (OpenJDK 13.0.1)"
  c:           ["C (GCC "],                 // "C (GCC 9.2.0)"
  cpp:         ["C++ (GCC "],               // "C++ (GCC 9.2.0)"
  python:      ["Python (3."],              // "Python (3.8.1)"
  sql:         ["SQL (SQLite"],             // "SQL (SQLite 3.x)"
  csharp:      ["C# ("],                    // "C# (Mono ...)" in CE
  vb:          ["Visual Basic.Net"],        // "Visual Basic.Net (vbnc ...)"
  javascript:  ["JavaScript (Node.js"]      // "JavaScript (Node.js 12..)"
};

function findLanguageId(langs, key) {
  const needles = MATCHERS[key] || [];
  for (const n of needles) {
    const hit = langs.find(l => l.name.includes(n));
    if (hit) return hit.id;
  }
  return null;
}

async function createSubmission(payload) {
  const url = `${JUDGE0}/submissions?base64_encoded=false&wait=false`;
  const r = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Judge0 create failed: ${r.status}`);
  return r.json(); // { token }
}

async function getSubmission(token) {
  const fields = "stdout,stderr,compile_output,status_id,time,memory";
  const r = await fetch(`${JUDGE0}/submissions/${token}?base64_encoded=false&fields=${fields}`);
  if (!r.ok) throw new Error(`Judge0 get failed: ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  // CORS for your static site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({error: "POST only"});

  try {
    const { language, source_code, stdin } = req.body || {};
    if (!language || !source_code) {
      return res.status(400).json({ error: "Missing `language` or `source_code`" });
    }

    const langs = await fetchLanguages();
    const language_id = findLanguageId(langs, language);
    if (!language_id) {
      return res.status(400).json({ error: `Unsupported language key: ${language}` });
    }

    const submission = await createSubmission({
      language_id,
      source_code,
      stdin: stdin || ""
      // you can also pass time/memory limits here
    });

    // Poll until done (status_id >= 3) or timeout ~8s
    const start = Date.now();
    let result = null;
    while (Date.now() - start < 8000) {
      result = await getSubmission(submission.token);
      if (result.status_id >= 3) break;
      await new Promise(r => setTimeout(r, 350));
    }

    return res.status(200).json({
      language,
      stdout: result?.stdout || "",
      stderr: (result?.compile_output || "") + (result?.stderr || ""),
      time: result?.time ?? null,
      memory: result?.memory ?? null,
      status_id: result?.status_id ?? null
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
