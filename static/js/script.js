(function () {
  "use strict";

  // ---------- DOM Elements ----------
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileLine = document.getElementById("fileLine");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const clearFileBtn = document.getElementById("clearFileBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const statusLine = document.getElementById("statusLine");
  const stamp = document.getElementById("stamp");
  const stampText = document.getElementById("stampText");
  const deck = document.getElementById("deck");
  const emptyState = document.getElementById("emptyState");
  const downloadLink = document.getElementById("downloadLink");

  // UX Elements
  const shimmerLoading = document.getElementById("shimmerLoading");
  const deckCountBadge = document.getElementById("deckCountBadge");
  const searchInput = document.getElementById("searchInput");
  const searchBox = document.getElementById("searchBox");
  const toggleAllBtn = document.getElementById("toggleAllBtn");
  const toastContainer = document.getElementById("toastContainer");

  // Extra Feature Elements
  const filterPills = document.getElementById("filterPills");
  const filterAllBtn = document.getElementById("filterAllBtn");
  const filterStarredBtn = document.getElementById("filterStarredBtn");
  const studyModeBtn = document.getElementById("studyModeBtn");
  const printBtn = document.getElementById("printBtn");

  // Study Modal Elements
  const studyModal = document.getElementById("studyModal");
  const studyModalBackdrop = document.getElementById("studyModalBackdrop");
  const closeStudyBtn = document.getElementById("closeStudyBtn");
  const studyCardBadge = document.getElementById("studyCardBadge");
  const studyStarBtn = document.getElementById("studyStarBtn");
  const flashcard3d = document.getElementById("flashcard3d");
  const studyQuestionText = document.getElementById("studyQuestionText");
  const studyAnswerText = document.getElementById("studyAnswerText");
  const prevCardBtn = document.getElementById("prevCardBtn");
  const flipCardBtn = document.getElementById("flipCardBtn");
  const nextCardBtn = document.getElementById("nextCardBtn");

  // Stepper Elements
  const step1 = document.getElementById("step1Indicator");
  const step2 = document.getElementById("step2Indicator");
  const step3 = document.getElementById("step3Indicator");
  const connector1 = document.getElementById("connector1");
  const connector2 = document.getElementById("connector2");

  // Settings, reset, quiz, ask
  const qTypeSelect = document.getElementById("qTypeSelect");
  const difficultySelect = document.getElementById("difficultySelect");
  const numQuestionsSelect = document.getElementById("numQuestionsSelect");
  const resetBtn = document.getElementById("resetBtn");
  const quizBtn = document.getElementById("quizBtn");
  const quizModal = document.getElementById("quizModal");
  const quizBackdrop = document.getElementById("quizBackdrop");
  const closeQuizBtn = document.getElementById("closeQuizBtn");
  const quizProgress = document.getElementById("quizProgress");
  const quizBody = document.getElementById("quizBody");
  const askPanel = document.getElementById("askPanel");
  const askLog = document.getElementById("askLog");
  const askForm = document.getElementById("askForm");
  const askInput = document.getElementById("askInput");
  const askBtn = document.getElementById("askBtn");

  let selectedFile = null;
  let uploadedPath = null;
  let currentCards = [];
  let isAllExpanded = true;
  let starredIndices = new Set();
  let currentFilter = "all";
  let currentStudyIndex = 0;

  // ---------- Stepper Helper ----------
  function setStep(step) {
    step1.classList.remove("active");
    step2.classList.remove("active");
    step3.classList.remove("active");
    connector1.classList.remove("completed");
    connector2.classList.remove("completed");

    if (step >= 1) step1.classList.add("active");
    if (step >= 2) {
      step2.classList.add("active");
      connector1.classList.add("completed");
    }
    if (step >= 3) {
      step3.classList.add("active");
      connector2.classList.add("completed");
    }
  }

  // ---------- Toast Notification ----------
  function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  // ---------- Helpers ----------
  function setStamp(state, label) {
    if (stamp) stamp.dataset.state = state;
    if (stampText) stampText.textContent = label;
  }

  function setStatus(msg, isError) {
    if (!statusLine) return;
    statusLine.textContent = msg || "";
    statusLine.classList.toggle("is-error", !!isError);
  }

  function setAnalyzeLabel(text) {
    const s = analyzeBtn ? analyzeBtn.querySelector("span") : null;
    if (s) s.textContent = text;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function parseJsonResponse(res) {
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error("Unexpected response from server.");
    }
  }

  function makeEl(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // Show MCQ options on separate lines
  function fillQuestion(el, text) {
    el.textContent = "";
    const str = String(text || "");
    const parts = str.split(/\s+(?=\([A-D]\)\s)/);
    if (parts.length >= 3) {
      el.appendChild(document.createTextNode(parts[0]));
      parts
        .slice(1)
        .forEach((p) => el.appendChild(makeEl("span", "q-option", p)));
    } else {
      el.textContent = str;
    }
  }

  // Coloured grounding badge
  function groundingChip(score) {
    const n = parseInt(score, 10);
    if (isNaN(n)) return null;
    const level = n >= 70 ? "high" : n >= 55 ? "mid" : "low";
    const chip = makeEl(
      "span",
      "ground-chip ground-" + level,
      "Grounding " + n + "%",
    );
    chip.title = "How closely the answer matches the retrieved source text";
    return chip;
  }

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

  // ---------- Deck Renderer ----------
  function renderDeck(rows) {
    deck.innerHTML = "";
    const dataRows = rows
      .slice(1)
      .filter((r) => r.length >= 2 && (r[0] || r[1]));

    currentCards = dataRows;

    if (deckCountBadge) {
      deckCountBadge.textContent =
        dataRows.length + (dataRows.length === 1 ? " Card" : " Cards");
    }

    if (!dataRows.length) {
      if (emptyState) emptyState.hidden = false;
      if (searchBox) searchBox.hidden = true;
      if (toggleAllBtn) toggleAllBtn.hidden = true;
      if (filterPills) filterPills.hidden = true;
      if (studyModeBtn) studyModeBtn.hidden = true;
      if (quizBtn) quizBtn.hidden = true;
      if (printBtn) printBtn.hidden = true;
      if (downloadLink) downloadLink.hidden = true;
      deck.appendChild(emptyState);
      return;
    }

    if (emptyState) emptyState.hidden = true;
    if (searchBox) searchBox.hidden = false;
    if (toggleAllBtn) {
      toggleAllBtn.hidden = false;
      toggleAllBtn.textContent = "Collapse All";
    }
    isAllExpanded = true;
    if (filterPills) filterPills.hidden = false;
    if (studyModeBtn) studyModeBtn.hidden = false;
    if (quizBtn) quizBtn.hidden = false;
    if (printBtn) printBtn.hidden = false;
    if (downloadLink && uploadedPath) downloadLink.hidden = false;

    dataRows.forEach((r, idx) => {
      const card = document.createElement("article");
      card.className = "qa-card";
      card.dataset.index = idx;
      card.style.animationDelay = idx * 50 + "ms";

      // Header row
      const cardHeader = document.createElement("div");
      cardHeader.className = "qa-card-header";

      const indexBadge = document.createElement("span");
      indexBadge.className = "qa-index";
      indexBadge.textContent = "Q" + String(idx + 1).padStart(2, "0");

      const cardTools = document.createElement("div");
      cardTools.className = "qa-card-tools";

      // Star Button
      const starBtn = document.createElement("button");
      starBtn.className =
        "btn-card-action btn-star" +
        (starredIndices.has(idx) ? " is-starred" : "");
      starBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      `;
      starBtn.title = "Star this card for review";
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (starredIndices.has(idx)) {
          starredIndices.delete(idx);
          starBtn.classList.remove("is-starred");
          showToast("Card unstarred");
        } else {
          starredIndices.add(idx);
          starBtn.classList.add("is-starred");
          showToast("Card starred ⭐");
        }
        updateStarredBadgeCount();
        if (currentFilter === "starred") applyFilters();
      });

      // Copy Question Button
      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-card-action";
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      `;
      copyBtn.title = "Copy question and answer";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const textToCopy = `Q: ${r[0]}\n\nA: ${r[1]}`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast("Card copied to clipboard!");
        });
      });

      // Toggle Answer Visibility Button
      const toggleCardBtn = document.createElement("button");
      toggleCardBtn.className = "btn-card-action";
      toggleCardBtn.textContent = "Toggle Answer";

      cardTools.appendChild(starBtn);
      cardTools.appendChild(copyBtn);
      cardTools.appendChild(toggleCardBtn);
      cardHeader.appendChild(indexBadge);
      cardHeader.appendChild(cardTools);

      // Question
      const q = document.createElement("h4");
      q.className = "qa-question";
      fillQuestion(q, r[0]);

      // Answer Container
      const answerContainer = document.createElement("div");
      answerContainer.className = "qa-answer-container";

      const answerBadge = document.createElement("div");
      answerBadge.className = "qa-answer-badge";
      answerBadge.textContent = "Answer";

      const a = document.createElement("div");
      a.className = "qa-answer";
      a.innerHTML = renderLiteMarkdown(r[1]);

      answerContainer.appendChild(answerBadge);
      answerContainer.appendChild(a);

      // Source page + grounding score
      if (r[2]) {
        answerContainer.appendChild(
          makeEl("span", "source-chip", "Source: page " + r[2]),
        );
      }
      if (r[3]) {
        const g = groundingChip(r[3]);
        if (g) answerContainer.appendChild(g);
      }

      // Toggle action on click
      const toggleAnswer = () => {
        answerContainer.classList.toggle("collapsed");
      };

      q.addEventListener("click", toggleAnswer);
      toggleCardBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleAnswer();
      });

      card.appendChild(cardHeader);
      card.appendChild(q);
      card.appendChild(answerContainer);
      deck.appendChild(card);
    });
  }

  // ---------- Expand/Collapse All ----------
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      isAllExpanded = !isAllExpanded;
      const answerContainers = deck.querySelectorAll(".qa-answer-container");
      answerContainers.forEach((container) => {
        if (isAllExpanded) {
          container.classList.remove("collapsed");
        } else {
          container.classList.add("collapsed");
        }
      });
      toggleAllBtn.textContent = isAllExpanded ? "Collapse All" : "Expand All";
    });
  }

  // ---------- File Selection ----------
  function handleFileSelected(file) {
    if (!file) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setStatus("Please choose a valid PDF file.", true);
      showToast("Selected file is not a PDF.");
      return;
    }

    selectedFile = file;
    uploadedPath = null;

    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatSize(file.size);
    if (fileLine) fileLine.hidden = false;

    if (uploadBtn) uploadBtn.disabled = false;
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (askPanel) askPanel.hidden = true;
    if (askLog) askLog.innerHTML = "";

    setStep(1);
    setStamp("received", "RECEIVED");
    setStatus("File selected. Ready to upload.");
    setAnalyzeLabel("Generate Questions");
    showToast("PDF document loaded.");
  }

  function resetFileSelection() {
    selectedFile = null;
    uploadedPath = null;
    currentCards = [];
    starredIndices.clear();
    currentFilter = "all";
    if (fileInput) fileInput.value = "";
    if (fileLine) fileLine.hidden = true;
    if (uploadBtn) uploadBtn.disabled = true;
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (downloadLink) downloadLink.hidden = true;
    if (resetBtn) resetBtn.hidden = true;
    if (askPanel) askPanel.hidden = true;
    if (askLog) askLog.innerHTML = "";
    if (searchInput) searchInput.value = "";
    if (filterAllBtn) filterAllBtn.classList.add("active");
    if (filterStarredBtn) filterStarredBtn.classList.remove("active");
    updateStarredBadgeCount();
    renderDeck([]);
    setStep(1);
    setStamp("idle", "NO FILE");
    setStatus("Awaiting document selection.");
    setAnalyzeLabel("Generate Questions");
  }

  if (clearFileBtn) {
    clearFileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetFileSelection();
    });
  }

  // "Upload New PDF" button
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFileSelection();
      showToast("Ready for a new PDF.");
      const ws = document.getElementById("workspace");
      if (ws) ws.scrollIntoView({ behavior: "smooth" });
    });
  }

  if (dropzone) {
    dropzone.addEventListener("click", () => fileInput && fileInput.click());
    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput && fileInput.click();
      }
    });

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
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) =>
      handleFileSelected(e.target.files[0]),
    );
  }

  // ---------- Upload Handler ----------
  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      uploadBtn.disabled = true;
      setStamp("processing", "UPLOADING");
      setStatus("Uploading document to server…");

      try {
        const formData = new FormData();
        formData.append("pdf_file", selectedFile);
        formData.append("filename", selectedFile.name);

        const res = await fetch("/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed (" + res.status + ").");

        const data = await parseJsonResponse(res);
        uploadedPath = data.pdf_filename;

        setStep(2);
        setStamp("received", "UPLOADED");
        setStatus("Document uploaded. Click 'Generate Questions' to process.");
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (askPanel) askPanel.hidden = false;
        showToast("Upload successful!");
      } catch (err) {
        setStamp("error", "ERROR");
        setStatus(err.message || "Upload failed.", true);
        uploadBtn.disabled = false;
        showToast("Error: Upload failed.");
      }
    });
  }

  // ---------- Analyze Handler ----------
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", async () => {
      if (!uploadedPath) return;

      analyzeBtn.disabled = true;
      setStamp("processing", "PROCESSING");
      setStatus("Reading document and generating questions — please wait…");

      if (shimmerLoading) shimmerLoading.hidden = false;
      if (deck) deck.style.opacity = "0.4";

      try {
        const formData = new FormData();
        formData.append("pdf_filename", uploadedPath);
        formData.append(
          "num_questions",
          numQuestionsSelect ? numQuestionsSelect.value : "10",
        );
        formData.append(
          "difficulty",
          difficultySelect ? difficultySelect.value : "medium",
        );
        formData.append("q_type", qTypeSelect ? qTypeSelect.value : "mixed");

        const res = await fetch("/analyze", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Analysis failed (" + res.status + ").");

        const data = await parseJsonResponse(res);
        const outputPath = data.output_file;
        const outputUrl = "/" + outputPath.replace(/^\/+/, "");

        const csvRes = await fetch(outputUrl, { cache: "no-store" });
        if (!csvRes.ok) throw new Error("Could not load generated CSV.");
        const csvText = await csvRes.text();

        const rows = parseCsv(csvText);

        if (shimmerLoading) shimmerLoading.hidden = true;
        if (deck) deck.style.opacity = "1";

        // fresh set of cards: clear old stars, search and filter
        starredIndices.clear();
        currentFilter = "all";
        if (searchInput) searchInput.value = "";
        if (filterAllBtn) filterAllBtn.classList.add("active");
        if (filterStarredBtn) filterStarredBtn.classList.remove("active");
        updateStarredBadgeCount();

        renderDeck(rows);

        if (downloadLink) {
          downloadLink.href = outputUrl;
          downloadLink.hidden = false;
        }
        if (resetBtn) resetBtn.hidden = false;

        // allow generating again with new settings (no re-upload needed)
        analyzeBtn.disabled = false;
        setAnalyzeLabel("Regenerate Questions");

        setStep(3);
        setStamp("ready", "READY");
        const count = rows.length - 1;
        const timeText = data.elapsed ? " in " + data.elapsed + "s" : "";
        setStatus(`Done — ${count} question(s) generated${timeText}.`);
        showToast(`Deck ready! ${count} cards created.`);

        const workspaceSection = document.getElementById("workspace");
        if (workspaceSection) {
          workspaceSection.scrollIntoView({ behavior: "smooth" });
        }
      } catch (err) {
        if (shimmerLoading) shimmerLoading.hidden = true;
        if (deck) deck.style.opacity = "1";

        setStamp("error", "ERROR");
        setStatus(err.message || "Analysis failed.", true);
        analyzeBtn.disabled = false;
        showToast("Error during question generation.");
      }
    });
  }

  // ---------- Star & Filtering System ----------
  function updateStarredBadgeCount() {
    if (filterStarredBtn) {
      filterStarredBtn.textContent = `Starred ★ (${starredIndices.size})`;
    }
  }

  function applyFilters() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const cards = deck.querySelectorAll(".qa-card");

    cards.forEach((card) => {
      const originalIdx = parseInt(card.dataset.index, 10);
      const isStarred = starredIndices.has(originalIdx);
      const text = card.textContent.toLowerCase();
      const matchesSearch = !query || text.includes(query);
      const matchesFilter =
        currentFilter === "all" || (currentFilter === "starred" && isStarred);

      if (matchesSearch && matchesFilter) {
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    });
  }

  if (filterAllBtn) {
    filterAllBtn.addEventListener("click", () => {
      currentFilter = "all";
      filterAllBtn.classList.add("active");
      if (filterStarredBtn) filterStarredBtn.classList.remove("active");
      applyFilters();
    });
  }

  if (filterStarredBtn) {
    filterStarredBtn.addEventListener("click", () => {
      currentFilter = "starred";
      filterStarredBtn.classList.add("active");
      if (filterAllBtn) filterAllBtn.classList.remove("active");
      applyFilters();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  // ---------- Print Sheet ----------
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

  // ---------- 3D Flashcard Study Mode ----------
  function openStudyModal(startIndex = 0) {
    if (!currentCards.length) return;
    currentStudyIndex = Math.max(
      0,
      Math.min(startIndex, currentCards.length - 1),
    );
    if (studyModal) {
      studyModal.hidden = false;
      studyModal.setAttribute("aria-hidden", "false");
    }
    renderStudyCard();
  }

  function closeStudyModal() {
    if (studyModal) {
      studyModal.hidden = true;
      studyModal.setAttribute("aria-hidden", "true");
    }
  }

  function renderStudyCard() {
    if (!currentCards.length) return;
    const cardData = currentCards[currentStudyIndex];
    if (flashcard3d) flashcard3d.classList.remove("is-flipped");

    if (studyCardBadge) {
      studyCardBadge.textContent = `Card ${currentStudyIndex + 1} of ${currentCards.length}`;
    }

    if (studyQuestionText)
      fillQuestion(studyQuestionText, cardData[0] || "No Question");
    if (studyAnswerText)
      studyAnswerText.innerHTML = renderLiteMarkdown(
        cardData[1] || "No Answer",
      );

    if (studyStarBtn) {
      if (starredIndices.has(currentStudyIndex)) {
        studyStarBtn.classList.add("is-starred");
      } else {
        studyStarBtn.classList.remove("is-starred");
      }
    }
  }

  if (studyModeBtn) {
    studyModeBtn.addEventListener("click", () => openStudyModal(0));
  }
  if (closeStudyBtn) closeStudyBtn.addEventListener("click", closeStudyModal);
  if (studyModalBackdrop)
    studyModalBackdrop.addEventListener("click", closeStudyModal);

  if (flashcard3d) {
    flashcard3d.addEventListener("click", () => {
      flashcard3d.classList.toggle("is-flipped");
    });
  }
  if (flipCardBtn) {
    flipCardBtn.addEventListener("click", () => {
      if (flashcard3d) flashcard3d.classList.toggle("is-flipped");
    });
  }
  if (prevCardBtn) {
    prevCardBtn.addEventListener("click", () => {
      if (currentStudyIndex > 0) {
        currentStudyIndex--;
        renderStudyCard();
      }
    });
  }
  if (nextCardBtn) {
    nextCardBtn.addEventListener("click", () => {
      if (currentStudyIndex < currentCards.length - 1) {
        currentStudyIndex++;
        renderStudyCard();
      }
    });
  }
  if (studyStarBtn) {
    studyStarBtn.addEventListener("click", () => {
      if (starredIndices.has(currentStudyIndex)) {
        starredIndices.delete(currentStudyIndex);
        showToast("Card unstarred");
      } else {
        starredIndices.add(currentStudyIndex);
        showToast("Card starred ⭐");
      }
      renderStudyCard();
      updateStarredBadgeCount();
      const listCardStar = deck.querySelector(
        `.qa-card[data-index="${currentStudyIndex}"] .btn-star`,
      );
      if (listCardStar) {
        listCardStar.classList.toggle(
          "is-starred",
          starredIndices.has(currentStudyIndex),
        );
      }
    });
  }

  // Keyboard Shortcuts for Flashcards
  document.addEventListener("keydown", (e) => {
    if (!studyModal || studyModal.hidden) return;

    if (e.key === "Escape") {
      closeStudyModal();
    } else if (e.key === "ArrowLeft") {
      if (currentStudyIndex > 0) {
        currentStudyIndex--;
        renderStudyCard();
      }
    } else if (e.key === "ArrowRight") {
      if (currentStudyIndex < currentCards.length - 1) {
        currentStudyIndex++;
        renderStudyCard();
      }
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (flashcard3d) flashcard3d.classList.toggle("is-flipped");
    }
  });

  // ---------- Quiz Mode ----------
  let quizOrder = [];
  let quizPos = 0;
  let quizScore = 0;
  let quizMissed = [];

  function startQuiz(indices) {
    if (!quizModal || !indices.length) return;
    quizOrder = indices.slice().sort(() => Math.random() - 0.5);
    quizMissed = [];
    quizPos = 0;
    quizScore = 0;
    quizModal.hidden = false;
    quizModal.setAttribute("aria-hidden", "false");
    renderQuizStep(false);
  }

  // Detect MCQ / True-False questions and work out the correct option
  function parseQuizItem(card) {
    const qText = String(card[0] || "");
    const ansText = String(card[1] || "");

    // True / False
    const tf = qText.match(
      /^\s*true\s*(?:or|\/)\s*false\s*[:\-\u2013]?\s*(.*)$/i,
    );
    if (tf) {
      const m = ansText.match(/\b(true|false)\b/i);
      if (m) {
        return {
          kind: "tf",
          stem: tf[1] || qText,
          options: ["True", "False"],
          correct: m[1].toLowerCase() === "true" ? 0 : 1,
        };
      }
    }

    // Multiple choice
    const parts = qText.split(/\s+(?=\([A-D]\)\s)/);
    if (parts.length >= 3) {
      const letters = parts
        .slice(1)
        .map((p) => (p.match(/^\(([A-D])\)/) || [])[1]);
      const m =
        ansText.match(
          /[Cc]orrect\s+(?:[Aa]nswer|[Oo]ption|[Cc]hoice)\s*(?:is|:)?\s*[:\-]?\s*\**\(?([A-D])\)?(?![A-Za-z])/,
        ) || ansText.match(/\(([A-D])\)/);
      if (m) {
        const idx = letters.indexOf(m[1]);
        if (idx !== -1) {
          return {
            kind: "mcq",
            stem: parts[0],
            options: parts.slice(1),
            correct: idx,
          };
        }
      }
    }

    return { kind: "open" };
  }

  // Pick-an-option question (MCQ and True/False)
  function renderChoiceQuestion(card, item, idx) {
    quizBody.appendChild(makeEl("div", "quiz-question", item.stem));

    const list = makeEl("div", "quiz-options");
    const buttons = [];

    item.options.forEach((label, i) => {
      const b = makeEl("button", "quiz-option", label);
      b.type = "button";
      b.addEventListener("click", () => {
        buttons.forEach((x) => (x.disabled = true));
        const isRight = i === item.correct;
        b.classList.add(isRight ? "is-correct" : "is-wrong");
        if (!isRight && buttons[item.correct])
          buttons[item.correct].classList.add("is-correct");

        if (isRight) quizScore++;
        else quizMissed.push(idx);

        quizBody.appendChild(
          makeEl(
            "div",
            "quiz-feedback " + (isRight ? "fb-right" : "fb-wrong"),
            isRight ? "✓ Correct!" : "✗ Not quite.",
          ),
        );

        const ans = makeEl("div", "quiz-answer");
        ans.innerHTML = renderLiteMarkdown(card[1]);
        quizBody.appendChild(ans);
        if (card[2])
          quizBody.appendChild(
            makeEl("span", "source-chip", "Source: page " + card[2]),
          );

        const row = makeEl("div", "quiz-actions");
        const isLast = quizPos >= quizOrder.length - 1;
        const next = makeEl(
          "button",
          "btn btn-primary",
          isLast ? "See score" : "Next",
        );
        next.addEventListener("click", () => {
          quizPos++;
          renderQuizStep(false);
        });
        row.appendChild(next);
        quizBody.appendChild(row);
      });
      buttons.push(b);
      list.appendChild(b);
    });

    quizBody.appendChild(list);
  }

  function renderQuizStep(revealed) {
    quizBody.innerHTML = "";
    if (quizPos >= quizOrder.length) {
      renderQuizResult();
      return;
    }
    const idx = quizOrder[quizPos];
    const card = currentCards[idx];
    const item = parseQuizItem(card);
    quizProgress.textContent = `Question ${quizPos + 1} of ${quizOrder.length}`;

    // MCQ / True-False: user picks an option
    if (item.kind === "mcq" || item.kind === "tf") {
      renderChoiceQuestion(card, item, idx);
      return;
    }

    // Short answer / mixed: show answer, then self-check
    const qBox = makeEl("div", "quiz-question");
    fillQuestion(qBox, card[0]);
    quizBody.appendChild(qBox);

    if (!revealed) {
      const show = makeEl("button", "btn btn-primary", "Show Answer");
      show.addEventListener("click", () => renderQuizStep(true));
      quizBody.appendChild(show);
      return;
    }

    const ans = makeEl("div", "quiz-answer");
    ans.innerHTML = renderLiteMarkdown(card[1]);
    quizBody.appendChild(ans);
    if (card[2])
      quizBody.appendChild(
        makeEl("span", "source-chip", "Source: page " + card[2]),
      );

    const row = makeEl("div", "quiz-actions");
    const got = makeEl("button", "btn btn-primary", "✓ I knew it");
    const missed = makeEl("button", "btn btn-secondary", "✗ Missed it");
    got.addEventListener("click", () => {
      quizScore++;
      quizPos++;
      renderQuizStep(false);
    });
    missed.addEventListener("click", () => {
      quizMissed.push(idx);
      quizPos++;
      renderQuizStep(false);
    });
    row.appendChild(got);
    row.appendChild(missed);
    quizBody.appendChild(row);
  }

  function renderQuizResult() {
    const total = quizOrder.length;
    const pct = Math.round((quizScore / total) * 100);
    quizProgress.textContent = "Quiz complete";
    quizBody.appendChild(
      makeEl("div", "quiz-score", `${quizScore} / ${total}`),
    );
    const msg =
      pct >= 80
        ? "Excellent!"
        : pct >= 50
          ? "Good, keep practicing."
          : "Review the missed cards and try again.";
    quizBody.appendChild(makeEl("div", "quiz-question", `${pct}% — ${msg}`));

    const row = makeEl("div", "quiz-actions");
    if (quizMissed.length) {
      const missedCopy = quizMissed.slice();
      const retry = makeEl(
        "button",
        "btn btn-primary",
        `Retry missed (${missedCopy.length})`,
      );
      retry.addEventListener("click", () => startQuiz(missedCopy));
      row.appendChild(retry);
    }
    const again = makeEl("button", "btn btn-secondary", "Restart quiz");
    again.addEventListener("click", () =>
      startQuiz(currentCards.map((_, i) => i)),
    );
    row.appendChild(again);
    quizBody.appendChild(row);
  }

  function closeQuiz() {
    if (!quizModal) return;
    quizModal.hidden = true;
    quizModal.setAttribute("aria-hidden", "true");
  }

  if (quizBtn)
    quizBtn.addEventListener("click", () =>
      startQuiz(currentCards.map((_, i) => i)),
    );
  if (closeQuizBtn) closeQuizBtn.addEventListener("click", closeQuiz);
  if (quizBackdrop) quizBackdrop.addEventListener("click", closeQuiz);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && quizModal && !quizModal.hidden) closeQuiz();
  });

  // ---------- Ask Your PDF ----------
  function addAskMessage(role, text) {
    const m = makeEl(
      "div",
      "ask-msg " + (role === "user" ? "ask-user" : "ask-bot"),
      text,
    );
    askLog.appendChild(m);
    askLog.scrollTop = askLog.scrollHeight;
    return m;
  }

  if (askForm) {
    askForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = askInput.value.trim();
      if (!q || !uploadedPath) return;

      addAskMessage("user", q);
      askInput.value = "";
      askBtn.disabled = true;
      const reply = addAskMessage("bot", "Thinking…");

      try {
        const fd = new FormData();
        fd.append("pdf_filename", uploadedPath);
        fd.append("question", q);
        const res = await fetch("/ask", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Request failed (" + res.status + ").");
        const data = await res.json();

        reply.innerHTML = renderLiteMarkdown(data.answer);
        if (data.pages && data.pages.length) {
          reply.appendChild(
            makeEl(
              "span",
              "source-chip",
              "Source: page " + data.pages.join(", "),
            ),
          );
        }
        const g = groundingChip(data.grounding);
        if (g) reply.appendChild(g);
      } catch (err) {
        reply.textContent = err.message || "Something went wrong.";
      }

      askBtn.disabled = false;
      askLog.scrollTop = askLog.scrollHeight;
    });
  }

  // ---------- Navigation Active State & Scroll-Spy ----------
  const navLinks = document.querySelectorAll(".nav-link");
  const spySections = document.querySelectorAll(
    "#workspace, #how-it-works, #features, #about",
  );

  function setActiveNav(activeId) {
    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href === "#" + activeId) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        const targetId = href.substring(1);
        const targetSec = document.getElementById(targetId);
        if (targetSec) {
          e.preventDefault();
          setActiveNav(targetId);
          targetSec.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  });

  if ("IntersectionObserver" in window && spySections.length) {
    const spyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        });
      },
      {
        root: null,
        rootMargin: "-20% 0px -55% 0px",
        threshold: 0,
      },
    );

    spySections.forEach((sec) => spyObserver.observe(sec));
  }
})();
