<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BizDoc – Document Analyzer</title>
  <style>
    :root { --bg:#0b0c10; --card:#121318; --muted:#a0a3ab; --text:#eef2ff; --accent:#4f46e5; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:linear-gradient(180deg,#0b0c10,#121318 45%, #0b0c10); color:var(--text); }
    .wrap { max-width: 880px; margin: 40px auto; padding: 0 16px; }
    .header { display:flex; align-items:center; gap:12px; margin-bottom: 18px;}
    .logo { width:40px; height:40px; border-radius:12px; background: var(--accent); display:grid; place-items:center; font-weight:800; }
    h1 { margin: 0 0 6px; letter-spacing: .2px; font-size: 28px;}
    p.muted { margin:0; color: var(--muted); }
    .card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); border-radius:16px; padding:18px; margin-top:18px; backdrop-filter: blur(4px); }
    label { display:block; margin:10px 0 6px; font-weight:600; }
    input[type="file"] { display:block; width:100%; padding:14px; background:#0f1117; border:1px dashed rgba(255,255,255,.2); border-radius:12px; color:var(--muted); }
    textarea { width:100%; padding:12px 14px; background:#0f1117; border:1px solid rgba(255,255,255,.12); border-radius:12px; color:var(--text); }
    .row { display:grid; grid-template-columns: 1fr 180px 180px; gap:12px; align-items:end; }
    button { padding:12px 16px; background: var(--accent); color:white; border:0; border-radius:12px; cursor:pointer; font-weight:700; }
    button.secondary { background:#1f2430; }
    button:disabled { opacity:.6; cursor:not-allowed; }
    .status { margin-top:10px; color: var(--muted); font-size: 14px; }
    pre { white-space: pre-wrap; word-break: break-word; background:#0b0c10; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:12px; }
    .footer { margin:18px 0 28px; color:var(--muted); font-size: 13px; }
    .pill { display:inline-block; padding:4px 10px; font-size:12px; border-radius:999px; background:rgba(79,70,229,.2); color: #cdd3ff; }
  </style>
  <!-- jsPDF for client-side PDF download -->
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">B</div>
      <div>
        <h1>BizDoc – Document Analyzer</h1>
        <p class="muted">Upload a business document, add an instruction, and get an AI summary.</p>
      </div>
    </div>

    <div class="card">
      <div class="pill">Health</div>
      <p class="status" id="ping">Checking <code>/api/ping</code>…</p>
    </div>

    <div class="card">
      <label for="file">Document</label>
      <input id="file" type="file" accept=".pdf,.docx,.txt,.csv" />
      <label for="instruction">Instruction (optional)</label>
      <textarea id="instruction" rows="3" placeholder="e.g., Summarize key risks, KPIs, and next actions."></textarea>

      <div class="row" style="margin-top:12px;">
        <div class="status" id="status">Idle</div>
        <button id="analyzeBtn">Analyze</button>
        <button id="downloadBtn" class="secondary" disabled>Download PDF</button>
      </div>

      <div id="resultBox" style="display:none; margin-top:12px;">
        <label>Result</label>
        <pre id="result"></pre>
      </div>
    </div>

    <div class="footer">
      Tip: You can also POST JSON to <code>/api/analyze</code> with a <code>fileUrl</code>.
    </div>
  </div>

  <script>
    const API_BASE = location.origin;
    let lastSummary = null;
    let lastFilename = null;

    async function ping() {
      const el = document.getElementById('ping');
      try {
        const r = await fetch(`${API_BASE}/api/ping`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        el.textContent = `OK ${data.time}`;
      } catch (e) {
        el.textContent = `Ping failed: ${e.message}`;
      }
    }

    async function analyze() {
      const fileInput = document.getElementById('file');
      const instruction = document.getElementById('instruction').value.trim();
      const status = document.getElementById('status');
      const btn = document.getElementById('analyzeBtn');
      const out = document.getElementById('result');
      const box = document.getElementById('resultBox');
      const dlBtn = document.getElementById('downloadBtn');

      box.style.display = 'none';
      out.textContent = '';
      status.textContent = 'Preparing…';
      btn.disabled = true;
      dlBtn.disabled = true;
      lastSummary = null;

      try {
        if (!fileInput.files || !fileInput.files[0]) {
          status.textContent = 'Please choose a file.';
          btn.disabled = false;
          return;
        }
        const file = fileInput.files[0];
        lastFilename = file.name;

        const form = new FormData();
        form.append('file', file);
        form.append('instruction', instruction);
        form.append('filename', file.name);

        status.textContent = 'Uploading & analyzing…';
        const res = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: form });

        const isJson = (res.headers.get('content-type') || '').includes('application/json');
        if (!res.ok) {
          const msg = isJson ? JSON.stringify(await res.json()) : await res.text();
          throw new Error(`Backend ${res.status}: ${msg}`);
        }

        const data = isJson ? await res.json() : { note: 'Non-JSON response', text: await res.text() };
        lastSummary = data.summary || JSON.stringify(data, null, 2);

        box.style.display = 'block';
        out.textContent = lastSummary;
        status.textContent = 'Done!';
        dlBtn.disabled = false;
      } catch (err) {
        box.style.display = 'block';
        out.textContent = `Error: ${err.message}`;
        status.textContent = 'Failed';
      } finally {
        btn.disabled = false;
      }
    }

    function downloadPDF() {
      if (!lastSummary) return;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      let y = margin;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('BizDoc – AI Summary', margin, y);
      y += 24;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const meta = `File: ${lastFilename || 'document'}   |   Generated: ${new Date().toLocaleString()}`;
      doc.text(meta, margin, y);
      y += 18;

      const lines = doc.splitTextToSize(lastSummary, 520);
      for (const line of lines) {
        if (y > 780) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 14;
      }

      const outName = (lastFilename || 'report').replace(/\.[^.]+$/, '') + '_summary.pdf';
      doc.save(outName);
    }

    document.getElementById('analyzeBtn').addEventListener('click', analyze);
    document.getElementById('downloadBtn').addEventListener('click', downloadPDF);
    ping();
  </script>
</body>
</html>
