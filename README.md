# PDF Forge

A browser extension + webpage for doing basic pdf stuff locally. no uploads, no accounts, nothing leaves your browser.

---

## Why

i was learning how to make browser extensions so i made this. built a webpage version too while i was at it.

---

## What it does

- merge pdfs
- split a pdf in two
- extract specific pages
- reorder pages
- rotate pages
- compress
- pdf to images
- images to pdf
- remove metadata
- add a watermark

---

## How to use it

**webpage**
just open `pdf-forge.html` in any browser and pick a tool. thats it.

**extension**
1. download `pdf-lib.min.js` from unpkg and drop it in the `lib/` folder
2. go to `chrome://extensions`, turn on developer mode, click load unpacked, select the folder
3. click the extension icon and pick a tool

for the PDF to images tool you also need `pdf.min.js` and `pdf.worker.min.js` from cdnjs in the same `lib/` folder.

---

built by [megkim](https://github.com/AmruthaMuralidhar1)
