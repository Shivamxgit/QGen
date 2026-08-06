(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileLine = document.getElementById("fileLine");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const uploadBtn = document.getElementById("uploadBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const statusLine = document.getElementById("statusLine");
  const stamp = document.getElementById("stamp");
  const stampText = document.getElementById("stampText");
  const deck = document.getElementById("deck");
  const emptyState = document.getElementById("emptyState");
  const downloadLink = document.getElementById("downloadLink");

  let selectedFile = null;
  let uploadedPath = null; // path returned by /upload, sent on to /analyze

  // ---------- helpers ----------

  function setStamp(state, label) {
    stamp.dataset.state = state;
    stampText.textContent = label;
  }

  function setStatus(msg, isError) {
    statusLine.textContent = msg || "";
    statusLine.classList.toggle("is-error", !!isError);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // Parses the body of the /upload and /analyze endpoints, which is a
  // JSON string served as text/plain (via json.dumps + jsonable_encoder).
  async function parseJsonResponse(res) {
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error("Unexpected response from server.");
    }
  }

  // Minimal CSV parser that respects quoted fields (commas/newlines inside quotes).
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(field);
          field = "";
          if (row.length > 1 || row[0] !== "") rows.push(row);
          row = [];
        } else {
          field += c;
        }
      }
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  // Escapes HTML, then renders a small safe subset of markdown:
  // **bold** / __bold__  ->  <strong>
  // lines starting with "* " or "- "  ->  <ul><li>
  // blank lines  ->  paragraph breaks
  function renderLiteMarkdown(raw) {
    const escapeHtml = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const text = escapeHtml(raw || "");
    const lines = text.split(/\r?\n/);

    let html = "";
    let inList = false;

    const closeList = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };
    const inlineFormat = (s) =>
      s.replace(
        /\*\*(.+?)\*\*|__(.+?)__/g,
        (_, a, b) => "<strong>" + (a || b) + "</strong>",
      );

    lines.forEach((line) => {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[*-]\s+(.*)$/);

      if (bulletMatch) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += "<li>" + inlineFormat(bulletMatch[1]) + "</li>";
      } else if (trimmed === "") {
        closeList();
      } else {
        closeList();
        html += "<p>" + inlineFormat(trimmed) + "</p>";
      }
    });
    closeList();

    return html || "<p></p>";
  }

  function renderDeck(rows) {
    deck.innerHTML = "";
    const dataRows = rows
      .slice(1)
      .filter((r) => r.length >= 2 && (r[0] || r[1]));

    if (!dataRows.length) {
      emptyState.hidden = false;
      deck.appendChild(emptyState);
      return;
    }

    dataRows.forEach((r, idx) => {
      const card = document.createElement("article");
      card.className = "qa-card";
      card.style.animationDelay = idx * 40 + "ms";

      const index = document.createElement("div");
      index.className = "qa-index";
      index.textContent = "Q" + String(idx + 1).padStart(2, "0");

      const q = document.createElement("p");
      q.className = "qa-question";
      q.textContent = r[0];

      const a = document.createElement("div");
      a.className = "qa-answer";
      a.innerHTML = renderLiteMarkdown(r[1]);

      card.appendChild(index);
      card.appendChild(q);
      card.appendChild(a);
      deck.appendChild(card);
    });
  }

  // ---------- file selection ----------

  function handleFileSelected(file) {
    if (!file) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setStatus("Please choose a PDF file.", true);
      return;
    }

    selectedFile = file;
    uploadedPath = null;

    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    fileLine.hidden = false;

    uploadBtn.disabled = false;
    analyzeBtn.disabled = true;

    setStamp("received", "RECEIVED");
    setStatus("Ready to upload.");
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", (e) =>
    handleFileSelected(e.target.files[0]),
  );

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    }),
  );

  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    }),
  );

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFileSelected(file);
  });

  // ---------- upload ----------

  uploadBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    setStamp("processing", "UPLOADING");
    setStatus("Uploading document…");

    try {
      const formData = new FormData();
      formData.append("pdf_file", selectedFile);
      formData.append("filename", selectedFile.name);

      const res = await fetch("/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed (" + res.status + ").");

      const data = await parseJsonResponse(res);
      uploadedPath = data.pdf_filename;

      setStamp("received", "UPLOADED");
      setStatus("Uploaded. Ready to generate questions.");
      analyzeBtn.disabled = false;
    } catch (err) {
      setStamp("error", "ERROR");
      setStatus(err.message || "Upload failed.", true);
      uploadBtn.disabled = false;
    }
  });

  // ---------- analyze ----------

  analyzeBtn.addEventListener("click", async () => {
    if (!uploadedPath) return;

    analyzeBtn.disabled = true;
    setStamp("processing", "PROCESSING");
    setStatus(
      "Reading document and generating questions — this can take a moment…",
    );

    try {
      const formData = new FormData();
      formData.append("pdf_filename", uploadedPath);

      const res = await fetch("/analyze", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Analysis failed (" + res.status + ").");

      const data = await parseJsonResponse(res);
      const outputPath = data.output_file; // e.g. "static/output/QA.csv"
      const outputUrl = "/" + outputPath.replace(/^\/+/, "");

      const csvRes = await fetch(outputUrl, { cache: "no-store" });
      if (!csvRes.ok) throw new Error("Could not load generated CSV.");
      const csvText = await csvRes.text();

      renderDeck(parseCsv(csvText));

      downloadLink.href = outputUrl;
      downloadLink.hidden = false;

      setStamp("ready", "READY");
      setStatus(
        "Done — " + (parseCsv(csvText).length - 1) + " question(s) generated.",
      );
    } catch (err) {
      setStamp("error", "ERROR");
      setStatus(err.message || "Analysis failed.", true);
      analyzeBtn.disabled = false;
    }
  });
})();
