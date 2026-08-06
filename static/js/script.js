(function () {
  "use strict";

  // DOM Elements
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

  // New UX Elements
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
        (_, a, b) => "<strong>" + (a || b) + "</strong>"
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

  // ---------- Deck Renderer with HCI Enhancements ----------
  function renderDeck(rows) {
    deck.innerHTML = "";
    const dataRows = rows
      .slice(1)
      .filter((r) => r.length >= 2 && (r[0] || r[1]));

    currentCards = dataRows;

    if (deckCountBadge) {
      deckCountBadge.textContent = dataRows.length + (dataRows.length === 1 ? " Card" : " Cards");
    }

    if (!dataRows.length) {
      if (emptyState) emptyState.hidden = false;
      if (searchBox) searchBox.hidden = true;
      if (toggleAllBtn) toggleAllBtn.hidden = true;
      if (filterPills) filterPills.hidden = true;
      if (studyModeBtn) studyModeBtn.hidden = true;
      if (printBtn) printBtn.hidden = true;
      if (downloadLink) downloadLink.hidden = true;
      deck.appendChild(emptyState);
      return;
    }

    if (emptyState) emptyState.hidden = true;
    if (searchBox) searchBox.hidden = false;
    if (toggleAllBtn) toggleAllBtn.hidden = false;
    if (filterPills) filterPills.hidden = false;
    if (studyModeBtn) studyModeBtn.hidden = false;
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
      starBtn.className = "btn-card-action btn-star" + (starredIndices.has(idx) ? " is-starred" : "");
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
      q.textContent = r[0];

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

  // ---------- Search Filter ----------
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const cards = deck.querySelectorAll(".qa-card");
      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        if (text.includes(query)) {
          card.style.display = "";
        } else {
          card.style.display = "none";
        }
      });
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

    setStep(1);
    setStamp("received", "RECEIVED");
    setStatus("File selected. Ready to upload.");
    showToast("PDF document loaded.");
  }

  function resetFileSelection() {
    selectedFile = null;
    uploadedPath = null;
    currentCards = [];
    starredIndices.clear();
    if (fileInput) fileInput.value = "";
    if (fileLine) fileLine.hidden = true;
    if (uploadBtn) uploadBtn.disabled = true;
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (downloadLink) downloadLink.hidden = true;
    renderDeck([]);
    setStep(1);
    setStamp("idle", "NO FILE");
    setStatus("Awaiting document selection.");
  }

  if (clearFileBtn) {
    clearFileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetFileSelection();
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
      })
    );

    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      })
    );

    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      handleFileSelected(file);
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) =>
      handleFileSelected(e.target.files[0])
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

        renderDeck(rows);

        if (downloadLink) {
          downloadLink.href = outputUrl;
          downloadLink.hidden = false;
        }

        setStep(3);
        setStamp("ready", "READY");
        const count = rows.length - 1;
        setStatus(`Done — ${count} question(s) generated.`);
        showToast(`Deck ready! ${count} cards created.`);

        // Scroll smoothly to deck results on mobile/desktop
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
      const matchesFilter = currentFilter === "all" || (currentFilter === "starred" && isStarred);

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
    currentStudyIndex = Math.max(0, Math.min(startIndex, currentCards.length - 1));
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

    if (studyQuestionText) studyQuestionText.textContent = cardData[0] || "No Question";
    if (studyAnswerText) studyAnswerText.innerHTML = renderLiteMarkdown(cardData[1] || "No Answer");

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
  if (studyModalBackdrop) studyModalBackdrop.addEventListener("click", closeStudyModal);

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
      // Update star button in deck list view if rendered
      const listCardStar = deck.querySelector(`.qa-card[data-index="${currentStudyIndex}"] .btn-star`);
      if (listCardStar) {
        listCardStar.classList.toggle("is-starred", starredIndices.has(currentStudyIndex));
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

  // ---------- Navigation Active State & Scroll-Spy ----------
  const navLinks = document.querySelectorAll(".nav-link");
  const spySections = document.querySelectorAll("#workspace, #how-it-works, #features, #about");

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

  // Click Navigation
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

  // Scroll Spy using IntersectionObserver
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
        threshold: 0
      }
    );

    spySections.forEach((sec) => spyObserver.observe(sec));
  }
})();

