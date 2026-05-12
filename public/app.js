const els = {
  fileInput: document.getElementById("fileInput"),
  btnPick: document.getElementById("btnPick"),
  btnAnalyze: document.getElementById("btnAnalyze"),
  preview: document.getElementById("preview"),
  status: document.getElementById("status"),
  highlights: document.getElementById("highlights"),
  easyText: document.getElementById("easyText"),
  rawText: document.getElementById("rawText")
};

function setStatus(msg, kind = "normal") {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", kind === "error");
}

function clearResults() {
  els.highlights.innerHTML = "";
  els.easyText.textContent = "";
  els.rawText.textContent = "";
}

function setLoading(isLoading) {
  els.btnAnalyze.disabled = isLoading || !els.fileInput.files?.[0];
  els.btnPick.disabled = isLoading;
  els.fileInput.disabled = isLoading;
}

function showPreview(file) {
  if (!file) {
    els.preview.src = "";
    els.preview.style.display = "none";
    return;
  }
  const url = URL.createObjectURL(file);
  els.preview.src = url;
  els.preview.style.display = "block";
}

async function analyze() {
  const file = els.fileInput.files?.[0];
  if (!file) return;

  clearResults();
  setLoading(true);
  setStatus("읽고 있어요. 잠깐만 기다려주세요…");

  const fd = new FormData();
  fd.append("image", file);
  fd.append("lang", "kor+eng");

  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "문제가 생겼어요.");

    const highlights = Array.isArray(data.highlights) ? data.highlights : [];
    if (highlights.length === 0) {
      const li = document.createElement("li");
      li.textContent = "중요한 내용을 자동으로 찾지 못했어요. 아래 ‘전체 글씨 보기’를 확인해 주세요.";
      els.highlights.appendChild(li);
    } else {
      for (const line of highlights) {
        const li = document.createElement("li");
        li.textContent = line;
        els.highlights.appendChild(li);
      }
    }

    els.easyText.textContent = data.easyText || "";
    els.rawText.textContent = data.rawText || "";

    setStatus("끝났어요. 아래 내용을 확인해 주세요.");
  } catch (e) {
    setStatus(e?.message || "문제가 생겼어요. 다시 해볼까요?", "error");
  } finally {
    setLoading(false);
  }
}

els.btnPick.addEventListener("click", () => {
  els.fileInput.click();
});

els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files?.[0];
  showPreview(file);
  clearResults();
  setStatus(file ? "사진을 골랐어요. ‘읽어보기’를 눌러주세요." : "사진을 골라주세요.");
  setLoading(false);
});

els.btnAnalyze.addEventListener("click", analyze);

setStatus("사진을 골라주세요.");
setLoading(false);

