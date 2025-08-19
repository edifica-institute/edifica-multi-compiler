<script type="module">
// === Java runner (CheerpJ + ECJ) ===
// Requires: <script src="https://cjrtnc.leaningtech.com/4.2/loader.js"></script> in <head>
// And libs/ecj.jar in your repo.

const ECJ_JAR = "/app/libs/ecj.jar"; // CheerpJ maps /app to your site root

// DOM handles from your page
const langSel = document.getElementById('lang');
const code    = document.getElementById('code');
const term    = document.getElementById('term');
const status  = document.getElementById('status');
const line    = document.getElementById('line');

// Simple Java starter
const JAVA_TPL = `import java.util.*; class Main {
  public static void main(String[] args){
    Scanner sc = new Scanner(System.in);
    System.out.print("enter ");
    int x = sc.nextInt();
    System.out.println("You typed: " + x);
  }
}`;

// Give template when Java is selected
langSel.addEventListener('change', () => {
  if (langSel.value === 'java' && (!code.value || !code.value.includes("class Main"))) {
    code.value = JAVA_TPL;
  }
});

let _cjReady = false;
async function ensureCheerpJ() {
  if (!_cjReady) { await cheerpjInit(); _cjReady = true; }
}

// We buffer lines typed in the input box BEFORE clicking Run.
// (V1: “batch stdin”. We can upgrade to true keystroke streaming later.)
let javaInput = [];
line.addEventListener('keydown', (e) => {
  if (langSel.value === 'java' && e.key === 'Enter') {
    const s = line.value; line.value = "";
    javaInput.push(s);
    term.textContent += s + "\n"; // echo to console
    e.preventDefault();
  }
});

// Helper “Runner” class: feeds stdin from /str/stdin.txt, captures stdout to /str/stdout.txt
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
    try {
      Class<?> c = Class.forName(mainClass);
      c.getMethod("main", String[].class).invoke(null, (Object)new String[0]);
    } catch (Throwable t) {
      if (t instanceof InvocationTargetException && t.getCause()!=null) t.getCause().printStackTrace();
      else t.printStackTrace();
      exit = 1;
    } finally {
      System.setIn(oldIn); System.setOut(oldOut); System.setErr(oldErr);
      Files.write(Paths.get("/str/stdout.txt"), buf.toString("UTF-8").getBytes(StandardCharsets.UTF_8));
      Files.write(Paths.get("/str/exitcode.txt"), String.valueOf(exit).getBytes(StandardCharsets.UTF_8));
    }
  }
}`;

// Compile + run Main.java entirely in the browser
async function runJava(javaSrc, stdinText) {
  await ensureCheerpJ();

  // Write sources and stdin into CheerpJ’s virtual FS
  cheerpOSAddStringFile("/str/Main.java",   javaSrc);
  cheerpOSAddStringFile("/str/Runner.java", RUNNER_SRC);
  cheerpOSAddStringFile("/str/stdin.txt",   stdinText || "");

  // Compile with ECJ to /str/classes
  const compileExit = await cheerpjRunMain(
    "org.eclipse.jdt.internal.compiler.batch.Main",
    ECJ_JAR,
    "-d", "/str/classes",
    "/str/Runner.java", "/str/Main.java"
  );
  if (compileExit !== 0) return { ok:false, out:"Compilation failed (see browser console for details)." };

  // Run our Runner → it invokes Main and captures stdout/stderr
  const runExit = await cheerpjRunMain("Runner", "/str/classes", "Main");
  const out = await (await cjFileBlob("/str/stdout.txt")).text();
  return { ok: runExit === 0, out };
}

// Hook into your existing Run button (only when Java is selected)
document.getElementById('run').addEventListener('click', async () => {
  if (langSel.value !== 'java') return; // let your other code handle Python/SQL/JS/HTML
  term.textContent = ""; status.textContent = "Running Java…";
  const { ok, out } = await runJava(code.value, javaInput.join("\n"));
  term.textContent += out;
  status.textContent = ok ? "Done" : "Error";
  javaInput = []; // reset for next run
});
</script>
