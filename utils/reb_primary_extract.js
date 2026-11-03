// Extract clean text from downloaded REB primary Pupil Books (PB) and
// Teacher Guides (TG) so we can compare them and import notes into Dex.
// Usage: node utils/reb_primary_extract.js [--force]
const fs = require('fs');
const path = require('path');
const { extractAndCleanPdf } = require('../services/pdfService');

const ROOT = process.env.REB_PRIMARY_ROOT || 'D:/dd/pdfs/primary';
const MANIFEST = path.join(ROOT, 'manifest.json');
const TEXT_DIR = path.join(ROOT, '_text');
const SUMMARY_PATH = path.join(ROOT, '_extraction_summary.json');
const force = process.argv.includes('--force');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const cacheName = (m) => `${m.grade}_${m.type}_${m.subject}.txt`;

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('Manifest not found:', MANIFEST);
    process.exit(1);
  }
  fs.mkdirSync(TEXT_DIR, { recursive: true });

  const manifest = readJson(MANIFEST);
  const summary = [];

  for (const m of manifest) {
    const base = cacheName(m);
    const txtPath = path.join(TEXT_DIR, base);
    const metaPath = path.join(TEXT_DIR, base.replace(/\.txt$/, '.json'));

    if (!force && fs.existsSync(txtPath) && fs.existsSync(metaPath)) {
      const meta = readJson(metaPath);
      summary.push(meta);
      console.log(`[skip] ${base} (${meta.wordCount} words)`);
      continue;
    }

    if (!fs.existsSync(m.path)) {
      console.log(`[miss] ${m.path}`);
      summary.push({ ...m, error: 'file missing' });
      continue;
    }

    const t0 = Date.now();
    try {
      const buffer = fs.readFileSync(m.path);
      const res = await extractAndCleanPdf(buffer);
      const cleanText = res.cleanText || '';
      fs.writeFileSync(txtPath, cleanText, 'utf8');
      const meta = {
        grade: m.grade,
        type: m.type,
        subject: m.subject,
        name: m.name,
        path: m.path,
        textPath: txtPath,
        bytes: buffer.length,
        pageCount: res.numPages,
        wordCount: res.stats.wordCount,
        characterCount: res.stats.characterCount,
        readingTimeMinutes: res.stats.readingTimeMinutes,
        title: res.info && res.info.Title ? String(res.info.Title) : '',
        extracted: true,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
      summary.push(meta);
      console.log(
        `[ok  ] ${base} pages=${meta.pageCount} words=${meta.wordCount} (${meta.seconds}s)`
      );
    } catch (err) {
      console.log(`[fail] ${base}: ${err.message}`);
      summary.push({
        grade: m.grade,
        type: m.type,
        subject: m.subject,
        name: m.name,
        path: m.path,
        error: err.message,
      });
    }
  }

  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');
  const ok = summary.filter((s) => s.extracted);
  const empty = ok.filter((s) => (s.wordCount || 0) < 50);
  console.log(`\nExtracted ${ok.length}/${manifest.length} files.`);
  console.log(`Low/empty text (likely scanned): ${empty.length}`);
  empty.forEach((e) => console.log(`  - ${e.grade} ${e.type} ${e.subject} (${e.wordCount} words)`));
  console.log('Summary:', SUMMARY_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

