// Turns a resume file into plain text lines plus any hyperlinks it contains.

export async function extractResume(file) {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith('.pdf')) return extractPdf(buffer);
  if (name.endsWith('.docx')) return extractDocx(buffer);
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: new TextDecoder().decode(buffer), links: [] };
  }
  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files are not supported. Save it as .docx or PDF and upload that.');
  }
  throw new Error('Please upload a PDF, DOCX or TXT file.');
}

// ---------- PDF ----------

async function extractPdf(buffer) {
  const pdfjs = await import(chrome.runtime.getURL('lib/vendor/pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;

  const pages = [];
  const links = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push(layoutPage(content.items, width, height));
    for (const a of await page.getAnnotations()) {
      if (a.url) links.push(a.url);
    }
  }
  return { text: pages.join('\n'), links };
}

// PDFs store positioned text runs, not lines. Rebuilds rows from coordinates and
// reads two-column layouts one column at a time.
function layoutPage(items, pageWidth, pageHeight) {
  const runs = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size };
    })
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const run of runs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - run.y) < Math.min(row.size, run.size) * 0.5) row.runs.push(run);
    else rows.push({ y: run.y, size: run.size, runs: [run] });
  }
  for (const row of rows) {
    row.runs.sort((a, b) => a.x - b.x);
    row.left = row.runs[0].x;
    row.right = Math.max(...row.runs.map((r) => r.x + r.w));
  }

  const gutter = findGutter(rows, pageWidth, pageHeight);
  if (gutter === null) return rows.map(rowText).join('\n');

  const crosses = (row) => row.runs.some((r) => r.x < gutter && r.x + r.w > gutter);
  const out = { top: [], left: [], right: [] };
  for (const row of rows) {
    if (crosses(row)) {
      out.top.push(rowText(row));
      continue;
    }
    const leftRuns = row.runs.filter((r) => r.x + r.w <= gutter);
    const rightRuns = row.runs.filter((r) => r.x >= gutter);
    if (leftRuns.length) out.left.push(rowText({ ...row, runs: leftRuns }));
    if (rightRuns.length) out.right.push(rowText({ ...row, runs: rightRuns }));
  }
  return [...out.top, ...out.left, ...out.right].join('\n');
}

// A column gutter is a vertical strip that almost no row runs across while both
// sides hold plenty of text. Rows with a right-aligned date do not trigger it,
// because full-width bullet lines still cross the strip.
function findGutter(rows, pageWidth, pageHeight) {
  const body = rows.filter((r) => r.y < pageHeight * 0.8);
  if (body.length < 12) return null;
  const step = pageWidth / 100;
  let best = null;
  let strip = null;
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.8; x += step) {
    let crossing = 0;
    let leftCount = 0;
    let rightCount = 0;
    for (const row of body) {
      if (row.runs.some((r) => r.x < x && r.x + r.w > x)) crossing++;
      if (row.runs.some((r) => r.x + r.w <= x)) leftCount++;
      if (row.runs.some((r) => r.x >= x)) rightCount++;
    }
    const enough = body.length * 0.3;
    if (crossing <= body.length * 0.03 && leftCount >= enough && rightCount >= enough) {
      strip = strip ? { start: strip.start, end: x } : { start: x, end: x };
      if (!best || strip.end - strip.start > best.end - best.start) best = strip;
    } else {
      strip = null;
    }
  }
  // The right column's left edge is the sharp one, so split just before it. Wide
  // header lines in the left column then stay on their own side.
  return best ? best.end : null;
}

function rowText(row) {
  let text = '';
  let prevEnd = null;
  for (const run of row.runs) {
    if (prevEnd !== null) {
      const gap = run.x - prevEnd;
      if (gap > run.size * 2.5) text = text.trimEnd() + ' | ';
      else if (gap > run.size * 0.15 && !text.endsWith(' ') && !run.str.startsWith(' ')) text += ' ';
    }
    text += run.str;
    prevEnd = run.x + run.w;
  }
  return text.trim();
}

// ---------- DOCX ----------

async function extractDocx(buffer) {
  const entries = readZipDirectory(buffer);
  const documentEntry = entries.get('word/document.xml');
  if (!documentEntry) throw new Error('This DOCX file looks damaged: no document body found.');

  const parser = new DOMParser();
  const xml = parser.parseFromString(await readZipEntry(buffer, documentEntry), 'application/xml');

  const rels = new Map();
  const relsEntry = entries.get('word/_rels/document.xml.rels');
  if (relsEntry) {
    const relsXml = parser.parseFromString(await readZipEntry(buffer, relsEntry), 'application/xml');
    for (const rel of relsXml.getElementsByTagName('Relationship')) {
      rels.set(rel.getAttribute('Id'), rel.getAttribute('Target'));
    }
  }

  const lines = [];
  for (const p of xml.getElementsByTagName('w:p')) {
    let line = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeName === 'w:t') line += child.textContent;
        else if (child.nodeName === 'w:tab') line += ' | ';
        else if (child.nodeName === 'w:br') line += '\n';
        else if (child.nodeType === 1) walk(child);
      }
    };
    walk(p);
    const isBullet = p.getElementsByTagName('w:numPr').length > 0;
    for (const part of line.split('\n')) {
      if (part.trim()) lines.push((isBullet ? '• ' : '') + part.trim());
    }
  }

  const links = [];
  for (const h of xml.getElementsByTagName('w:hyperlink')) {
    const target = rels.get(h.getAttribute('r:id'));
    if (target) links.push(target);
  }
  return { text: lines.join('\n'), links };
}

function readZipDirectory(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0 && i >= buffer.byteLength - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This DOCX file looks damaged: it is not a valid archive.');

  const entries = new Map();
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, nameLength));
    entries.set(name, {
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      localOffset: view.getUint32(pos + 42, true),
    });
    pos += 46 + nameLength + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  return entries;
}

async function readZipEntry(buffer, entry) {
  const view = new DataView(buffer);
  const start =
    entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
  const bytes = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
