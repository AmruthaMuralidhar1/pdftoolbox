'use strict';

// ── Utilities ──────────────────────────────────────────────────────────────

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parse "1, 3-5, 8" into [1, 3, 4, 5, 8] (1-indexed), clamped to pageCount.
function parsePageRanges(input, pageCount) {
  const pages = new Set();
  for (const part of input.split(',').map(s => s.trim()).filter(Boolean)) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= Math.min(b, pageCount); i++) {
        if (i >= 1) pages.add(i);
      }
    } else {
      const n = Number(part);
      if (n >= 1 && n <= pageCount) pages.add(n);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

function setStatus(el, msg, type = 'info') {
  let s = el.querySelector('.status');
  if (!s) { s = document.createElement('div'); s.className = 'status'; el.appendChild(s); }
  s.className = `status ${type}`;
  s.textContent = msg;
}

// Convert any image File to a PNG ArrayBuffer via canvas (handles JPEG, PNG, WebP, GIF, …).
function imageToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob.arrayBuffer().then(resolve).catch(reject), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load ${file.name}`)); };
    img.src = url;
  });
}

// ── Drag helpers ───────────────────────────────────────────────────────────

// Horizontal drag-and-drop (for page grid).
function makeDraggableH(item, container) {
  item.addEventListener('dragstart', () => item.classList.add('dragging'));
  item.addEventListener('dragend', () => item.classList.remove('dragging'));
  item.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (!dragging || dragging === item) return;
    const mid = item.getBoundingClientRect().left + item.getBoundingClientRect().width / 2;
    container.insertBefore(dragging, e.clientX < mid ? item : item.nextSibling);
  });
}

// Vertical drag-and-drop (for file lists).
function makeDraggableV(item, container) {
  item.addEventListener('dragstart', () => item.classList.add('dragging'));
  item.addEventListener('dragend', () => item.classList.remove('dragging'));
  item.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (!dragging || dragging === item) return;
    const mid = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    container.insertBefore(dragging, e.clientY < mid ? item : item.nextSibling);
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────

const TOOL_TITLES = {
  merge:    '📎 Merge PDFs',
  split:    '✂️ Split PDF',
  extract:  '📄 Extract Pages',
  reorder:  '🔄 Reorder Pages',
  rotate:   '↻ Rotate Pages',
  compress: '🗜️ Compress PDF',
  pdf2img:  '🖼️ PDF → Images',
  img2pdf:  '📑 Images → PDF',
  metadata: '🧹 Clean Metadata',
  watermark:'💧 Watermark',
};

const TOOLS = { merge, split, extract, reorder, rotate, compress, pdf2img, img2pdf, metadata, watermark };

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tool]').forEach(btn =>
    btn.addEventListener('click', () => openTool(btn.dataset.tool))
  );
  document.getElementById('back-btn').addEventListener('click', showHome);
});

function showHome() {
  document.getElementById('home').classList.add('active');
  document.getElementById('tool-screen').classList.remove('active');
}

function openTool(name) {
  document.getElementById('home').classList.remove('active');
  document.getElementById('tool-screen').classList.add('active');
  document.getElementById('tool-title').textContent = TOOL_TITLES[name] || name;
  const content = document.getElementById('tool-content');
  content.innerHTML = '';
  if (TOOLS[name]) TOOLS[name](content);
}

// ── 1. Merge PDFs ──────────────────────────────────────────────────────────

function merge(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDFs to merge (in order)</label>
      <input type="file" id="merge-input" accept=".pdf" multiple>
    </div>
    <div id="merge-list" class="file-list"></div>
    <button class="primary" id="merge-btn">Merge & Download</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#merge-input');
  const list  = el.querySelector('#merge-list');

  input.addEventListener('change', () => {
    list.innerHTML = [...input.files].map((f, i) =>
      `<div class="file-item">📄 <span>${f.name}</span></div>`
    ).join('');
  });

  el.querySelector('#merge-btn').addEventListener('click', async () => {
    if (!input.files.length) return setStatus(el, 'Select at least one PDF.', 'error');
    const btn = el.querySelector('#merge-btn');
    btn.disabled = true;
    setStatus(el, 'Merging…', 'info');
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const file of input.files) {
        const src = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(file));
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      downloadBytes(await out.save(), 'merged.pdf');
      setStatus(el, `Done — ${input.files.length} file(s) merged.`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 2. Split PDF ───────────────────────────────────────────────────────────

function split(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="split-input" accept=".pdf">
    </div>
    <span class="page-count" id="split-count"></span>
    <div class="field">
      <label>Split after page number</label>
      <input type="number" id="split-at" min="1" placeholder="e.g. 3">
    </div>
    <p class="hint">Creates two files: pages 1–N and pages N+1–end.</p>
    <button class="primary" id="split-btn">Split & Download Both</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#split-input');
  const countEl = el.querySelector('#split-count');
  let pageCount = 0;

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      pageCount = doc.getPageCount();
      countEl.textContent = `${pageCount} pages`;
      el.querySelector('#split-at').max = pageCount - 1;
    } catch (e) {
      setStatus(el, `Could not read PDF: ${e.message}`, 'error');
    }
  });

  el.querySelector('#split-btn').addEventListener('click', async () => {
    if (!input.files[0]) return setStatus(el, 'Select a PDF.', 'error');
    const at = parseInt(el.querySelector('#split-at').value, 10);
    if (!at || at < 1 || at >= pageCount) {
      return setStatus(el, `Enter a page number between 1 and ${pageCount - 1}.`, 'error');
    }
    const btn = el.querySelector('#split-btn');
    btn.disabled = true;
    setStatus(el, 'Splitting…', 'info');
    try {
      const src = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));

      const part1 = await PDFLib.PDFDocument.create();
      const p1 = await part1.copyPages(src, Array.from({ length: at }, (_, i) => i));
      p1.forEach(p => part1.addPage(p));
      downloadBytes(await part1.save(), 'part1.pdf');

      await new Promise(r => setTimeout(r, 100));

      const part2 = await PDFLib.PDFDocument.create();
      const p2 = await part2.copyPages(src, Array.from({ length: pageCount - at }, (_, i) => i + at));
      p2.forEach(p => part2.addPage(p));
      downloadBytes(await part2.save(), 'part2.pdf');

      setStatus(el, `Done — part1.pdf (${at} pages) and part2.pdf (${pageCount - at} pages).`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 3. Extract Pages ───────────────────────────────────────────────────────

function extract(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="ex-input" accept=".pdf">
    </div>
    <span class="page-count" id="ex-count"></span>
    <div class="field">
      <label>Pages to extract (e.g. 1, 3, 5-8)</label>
      <input type="text" id="ex-range" placeholder="1, 3, 5-8">
    </div>
    <button class="primary" id="ex-btn">Extract & Download</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#ex-input');
  let pageCount = 0;

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      pageCount = doc.getPageCount();
      el.querySelector('#ex-count').textContent = `${pageCount} pages`;
    } catch (e) {
      setStatus(el, `Could not read PDF: ${e.message}`, 'error');
    }
  });

  el.querySelector('#ex-btn').addEventListener('click', async () => {
    if (!input.files[0]) return setStatus(el, 'Select a PDF.', 'error');
    const rangeStr = el.querySelector('#ex-range').value.trim();
    if (!rangeStr) return setStatus(el, 'Enter a page range.', 'error');
    const pages = parsePageRanges(rangeStr, pageCount);
    if (!pages.length) return setStatus(el, 'No valid pages in that range.', 'error');

    const btn = el.querySelector('#ex-btn');
    btn.disabled = true;
    setStatus(el, 'Extracting…', 'info');
    try {
      const src = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const out = await PDFLib.PDFDocument.create();
      const copied = await out.copyPages(src, pages.map(p => p - 1));
      copied.forEach(p => out.addPage(p));
      downloadBytes(await out.save(), 'extracted.pdf');
      setStatus(el, `Done — extracted ${pages.length} page(s).`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 4. Reorder Pages ───────────────────────────────────────────────────────

function reorder(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="ro-input" accept=".pdf">
    </div>
    <div id="ro-grid" class="page-grid"></div>
    <p class="hint" id="ro-hint" style="display:none">Drag tiles to reorder pages, then export.</p>
    <button class="primary" id="ro-btn" style="display:none">Export Reordered PDF</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#ro-input');
  const grid  = el.querySelector('#ro-grid');
  const btn   = el.querySelector('#ro-btn');

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const n = doc.getPageCount();
      grid.innerHTML = '';
      for (let i = 1; i <= n; i++) {
        const tile = document.createElement('div');
        tile.className = 'page-item';
        tile.draggable = true;
        tile.dataset.page = i;
        tile.innerHTML = `<div class="page-num">${i}</div>`;
        makeDraggableH(tile, grid);
        grid.appendChild(tile);
      }
      el.querySelector('#ro-hint').style.display = '';
      btn.style.display = '';
    } catch (e) {
      setStatus(el, `Could not read PDF: ${e.message}`, 'error');
    }
  });

  btn.addEventListener('click', async () => {
    if (!input.files[0]) return;
    btn.disabled = true;
    setStatus(el, 'Exporting…', 'info');
    try {
      const src = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const order = [...grid.querySelectorAll('.page-item')].map(t => parseInt(t.dataset.page, 10) - 1);
      const out = await PDFLib.PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach(p => out.addPage(p));
      downloadBytes(await out.save(), 'reordered.pdf');
      setStatus(el, 'Done — reordered PDF downloaded.', 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 5. Rotate Pages ────────────────────────────────────────────────────────

function rotate(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="rt-input" accept=".pdf">
    </div>
    <div id="rt-rows" class="rotate-rows" style="display:none"></div>
    <div class="row" id="rt-all-row" style="display:none">
      <button class="secondary" id="rt-all-cw">Rotate All ↻ 90°</button>
      <button class="secondary" id="rt-all-ccw">Rotate All ↺ 90°</button>
    </div>
    <button class="primary" id="rt-btn" style="display:none">Export PDF</button>
    <div class="status"></div>
  `;

  const input   = el.querySelector('#rt-input');
  const rowsDiv = el.querySelector('#rt-rows');
  const rotations = {};
  let pageCount = 0;

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      pageCount = doc.getPageCount();
      for (let i = 1; i <= pageCount; i++) rotations[i] = 0;

      rowsDiv.innerHTML = Array.from({ length: pageCount }, (_, i) => `
        <div class="rotate-row">
          <span class="page-label">Page ${i + 1}</span>
          <button class="icon-btn" data-page="${i + 1}" data-dir="-90">↺</button>
          <span class="rot-label" data-page="${i + 1}">0°</span>
          <button class="icon-btn" data-page="${i + 1}" data-dir="90">↻</button>
        </div>
      `).join('');

      rowsDiv.style.display = '';
      el.querySelector('#rt-all-row').style.display = '';
      el.querySelector('#rt-btn').style.display = '';
    } catch (e) {
      setStatus(el, `Could not read PDF: ${e.message}`, 'error');
    }
  });

  rowsDiv.addEventListener('click', e => {
    const btn = e.target.closest('[data-dir]');
    if (!btn) return;
    const page = parseInt(btn.dataset.page, 10);
    rotations[page] = ((rotations[page] + parseInt(btn.dataset.dir, 10)) + 360) % 360;
    rowsDiv.querySelector(`.rot-label[data-page="${page}"]`).textContent = `${rotations[page]}°`;
  });

  function rotateAll(delta) {
    for (let i = 1; i <= pageCount; i++) {
      rotations[i] = (rotations[i] + delta + 360) % 360;
      rowsDiv.querySelector(`.rot-label[data-page="${i}"]`).textContent = `${rotations[i]}°`;
    }
  }
  el.querySelector('#rt-all-cw').addEventListener('click', () => rotateAll(90));
  el.querySelector('#rt-all-ccw').addEventListener('click', () => rotateAll(-90));

  el.querySelector('#rt-btn').addEventListener('click', async () => {
    if (!input.files[0]) return;
    const btn = el.querySelector('#rt-btn');
    btn.disabled = true;
    setStatus(el, 'Exporting…', 'info');
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      doc.getPages().forEach((page, idx) => {
        const r = rotations[idx + 1] || 0;
        if (r) page.setRotation(PDFLib.degrees(r));
      });
      downloadBytes(await doc.save(), 'rotated.pdf');
      setStatus(el, 'Done — rotated PDF downloaded.', 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 6. Compress PDF ────────────────────────────────────────────────────────

function compress(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="cmp-input" accept=".pdf">
    </div>
    <span class="page-count" id="cmp-original"></span>
    <div class="field">
      <label>Mode</label>
      <select id="cmp-mode">
        <option value="streams">Object streams (best for text-heavy PDFs)</option>
        <option value="metadata">Strip metadata only (lossless, minimal gain)</option>
      </select>
    </div>
    <p class="hint">Client-side compression is limited — image-heavy PDFs benefit most from a dedicated tool.</p>
    <button class="primary" id="cmp-btn">Compress & Download</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#cmp-input');
  let origSize = 0;

  input.addEventListener('change', () => {
    if (input.files[0]) {
      origSize = input.files[0].size;
      el.querySelector('#cmp-original').textContent = `Original: ${(origSize / 1024).toFixed(1)} KB`;
    }
  });

  el.querySelector('#cmp-btn').addEventListener('click', async () => {
    if (!input.files[0]) return setStatus(el, 'Select a PDF.', 'error');
    const btn = el.querySelector('#cmp-btn');
    btn.disabled = true;
    setStatus(el, 'Compressing…', 'info');
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const mode = el.querySelector('#cmp-mode').value;
      // Strip metadata to reduce size regardless of mode.
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
      doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
      const outBytes = await doc.save({ useObjectStreams: mode === 'streams' });
      const newSize = outBytes.byteLength;
      const delta = ((origSize - newSize) / origSize * 100).toFixed(1);
      downloadBytes(outBytes, 'compressed.pdf');
      const sign = newSize < origSize ? `−${Math.abs(delta)}%` : `+${Math.abs(delta)}%`;
      setStatus(el, `Done — ${(newSize / 1024).toFixed(1)} KB (${sign}). File downloaded.`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 7. PDF → Images ────────────────────────────────────────────────────────

function pdf2img(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="p2i-input" accept=".pdf">
    </div>
    <span class="page-count" id="p2i-count"></span>
    <div class="field">
      <label>Pages (blank = all, e.g. 1-3, 5)</label>
      <input type="text" id="p2i-range" placeholder="all">
    </div>
    <div class="row">
      <div class="field">
        <label>Format</label>
        <select id="p2i-format">
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
        </select>
      </div>
      <div class="field">
        <label>Scale (1=96dpi, 2=192dpi)</label>
        <input type="number" id="p2i-scale" value="2" min="1" max="4" step="0.5">
      </div>
    </div>
    <button class="primary" id="p2i-btn">Convert & Download</button>
    <div id="p2i-progress" class="hint"></div>
    <div class="status"></div>
  `;

  const input = el.querySelector('#p2i-input');
  let pageCount = 0;

  input.addEventListener('change', async () => {
    if (!input.files[0] || typeof pdfjsLib === 'undefined') return;
    try {
      const pdf = await pdfjsLib.getDocument({ data: await readFileAsArrayBuffer(input.files[0]) }).promise;
      pageCount = pdf.numPages;
      el.querySelector('#p2i-count').textContent = `${pageCount} pages`;
    } catch (e) { /* ignore */ }
  });

  el.querySelector('#p2i-btn').addEventListener('click', async () => {
    if (!input.files[0]) return setStatus(el, 'Select a PDF.', 'error');
    if (typeof pdfjsLib === 'undefined') {
      return setStatus(el,
        'PDF.js not loaded. Place lib/pdf.min.js + lib/pdf.worker.min.js in the extension folder. ' +
        'Download from cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'error');
    }
    const btn = el.querySelector('#p2i-btn');
    btn.disabled = true;
    const progress = el.querySelector('#p2i-progress');
    setStatus(el, 'Loading PDF…', 'info');
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
      const pdf = await pdfjsLib.getDocument({ data: await readFileAsArrayBuffer(input.files[0]) }).promise;
      const total = pdf.numPages;
      const rangeStr = el.querySelector('#p2i-range').value.trim();
      const pages = rangeStr ? parsePageRanges(rangeStr, total) : Array.from({ length: total }, (_, i) => i + 1);
      const format = el.querySelector('#p2i-format').value;
      const scale = parseFloat(el.querySelector('#p2i-scale').value) || 2;
      const ext = format === 'image/png' ? 'png' : 'jpg';

      for (let i = 0; i < pages.length; i++) {
        progress.textContent = `Rendering page ${i + 1} of ${pages.length}…`;
        const page = await pdf.getPage(pages[i]);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const a = document.createElement('a');
        a.href = canvas.toDataURL(format, 0.92);
        a.download = `page-${String(pages[i]).padStart(3, '0')}.${ext}`;
        a.click();
        await new Promise(r => setTimeout(r, 120));
      }
      progress.textContent = '';
      setStatus(el, `Done — ${pages.length} image(s) downloaded.`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 8. Images → PDF ────────────────────────────────────────────────────────

function img2pdf(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select images (JPEG, PNG, WebP…)</label>
      <input type="file" id="i2p-input" accept="image/*" multiple>
    </div>
    <div id="i2p-list" class="file-list"></div>
    <p class="hint" id="i2p-hint" style="display:none">Drag rows to reorder before creating the PDF.</p>
    <button class="primary" id="i2p-btn">Create PDF & Download</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#i2p-input');
  const list  = el.querySelector('#i2p-list');
  let files   = [];

  input.addEventListener('change', () => {
    files = [...input.files];
    renderFileList();
    el.querySelector('#i2p-hint').style.display = files.length > 1 ? '' : 'none';
  });

  function renderFileList() {
    list.innerHTML = files.map((f, i) =>
      `<div class="file-item" draggable="true" data-idx="${i}">
         <span class="drag-handle">⠿</span> 🖼️ <span>${f.name}</span>
       </div>`
    ).join('');
    list.querySelectorAll('.file-item').forEach(item => makeDraggableV(item, list));
  }

  el.querySelector('#i2p-btn').addEventListener('click', async () => {
    if (!files.length) return setStatus(el, 'Select at least one image.', 'error');
    const btn = el.querySelector('#i2p-btn');
    btn.disabled = true;
    setStatus(el, 'Building PDF…', 'info');

    // Resolve final order from DOM.
    const ordered = [...list.querySelectorAll('.file-item')].map(item => files[parseInt(item.dataset.idx, 10)]);

    try {
      const doc = await PDFLib.PDFDocument.create();
      for (const file of ordered) {
        // Convert any image format to PNG via canvas for reliable embedding.
        const pngBytes = await imageToArrayBuffer(file);
        const img = await doc.embedPng(pngBytes);
        const page = doc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      downloadBytes(await doc.save(), 'images.pdf');
      setStatus(el, `Done — ${ordered.length} image(s) combined into PDF.`, 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 9. Metadata Cleaner ────────────────────────────────────────────────────

function metadata(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="md-input" accept=".pdf">
    </div>
    <div id="md-box" class="metadata-box" style="display:none"></div>
    <button class="primary" id="md-btn" style="display:none">Strip Metadata & Download</button>
    <div class="status"></div>
  `;

  const input = el.querySelector('#md-input');
  const box   = el.querySelector('#md-box');
  const btn   = el.querySelector('#md-btn');

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const fields = {
        Title:    doc.getTitle(),
        Author:   doc.getAuthor(),
        Subject:  doc.getSubject(),
        Keywords: doc.getKeywords(),
        Creator:  doc.getCreator(),
        Producer: doc.getProducer(),
      };
      const entries = Object.entries(fields).filter(([, v]) => v);
      box.innerHTML = entries.length
        ? entries.map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`).join('')
        : '<span style="color:#4b5563">No metadata found.</span>';
      box.style.display = '';
      btn.style.display = '';
    } catch (e) {
      setStatus(el, `Could not read PDF: ${e.message}`, 'error');
    }
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus(el, 'Stripping…', 'info');
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
      doc.setKeywords([]); doc.setCreator(''); doc.setProducer('');
      doc.setCreationDate(new Date(0));
      doc.setModificationDate(new Date(0));
      downloadBytes(await doc.save(), 'cleaned.pdf');
      box.innerHTML = '<span style="color:#4b5563">All metadata removed.</span>';
      setStatus(el, 'Done — metadata stripped and file downloaded.', 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── 10. Watermark ──────────────────────────────────────────────────────────

function watermark(el) {
  el.innerHTML = `
    <div class="field">
      <label>Select PDF</label>
      <input type="file" id="wm-input" accept=".pdf">
    </div>
    <div class="field">
      <label>Watermark text</label>
      <input type="text" id="wm-text" value="CONFIDENTIAL" placeholder="CONFIDENTIAL">
    </div>
    <div class="row">
      <div class="field">
        <label>Font size</label>
        <input type="number" id="wm-size" value="60" min="10" max="200">
      </div>
      <div class="field">
        <label>Opacity (0.05–1)</label>
        <input type="number" id="wm-opacity" value="0.2" min="0.05" max="1" step="0.05">
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>Color</label>
        <input type="color" id="wm-color" value="#ff0000">
      </div>
      <div class="field">
        <label>Position</label>
        <select id="wm-pos">
          <option value="center">Center diagonal</option>
          <option value="top">Top center</option>
          <option value="bottom">Bottom center</option>
        </select>
      </div>
    </div>
    <button class="primary" id="wm-btn">Add Watermark & Download</button>
    <div class="status"></div>
  `;

  el.querySelector('#wm-btn').addEventListener('click', async () => {
    const input   = el.querySelector('#wm-input');
    if (!input.files[0]) return setStatus(el, 'Select a PDF.', 'error');
    const text = el.querySelector('#wm-text').value.trim();
    if (!text) return setStatus(el, 'Enter watermark text.', 'error');

    const btn = el.querySelector('#wm-btn');
    btn.disabled = true;
    setStatus(el, 'Adding watermark…', 'info');
    try {
      const doc = await PDFLib.PDFDocument.load(await readFileAsArrayBuffer(input.files[0]));
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const fontSize = parseInt(el.querySelector('#wm-size').value, 10) || 60;
      const opacity  = parseFloat(el.querySelector('#wm-opacity').value) || 0.2;
      const hex = el.querySelector('#wm-color').value;
      const color = PDFLib.rgb(
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      );
      const position = el.querySelector('#wm-pos').value;
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        let x, y, rotate;
        if (position === 'center') {
          // Diagonal: anchor point is page centre, text is rotated 45°.
          x = (width - textWidth) / 2;
          y = height / 2;
          rotate = PDFLib.degrees(45);
        } else if (position === 'top') {
          x = (width - textWidth) / 2;
          y = height - fontSize - 20;
          rotate = PDFLib.degrees(0);
        } else {
          x = (width - textWidth) / 2;
          y = 20;
          rotate = PDFLib.degrees(0);
        }
        page.drawText(text, { x, y, size: fontSize, font, color, opacity, rotate });
      }

      downloadBytes(await doc.save(), 'watermarked.pdf');
      setStatus(el, 'Done — watermarked PDF downloaded.', 'success');
    } catch (e) {
      setStatus(el, `Error: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
