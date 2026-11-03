// Compare REB primary Pupil Books (PB = notes) with Teacher Guides (TG).
// Produces D:/dd/reports/primary_pb_tg_comparison.{md,json}
// Usage: node utils/reb_primary_compare.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.REB_PRIMARY_ROOT || 'D:/dd/pdfs/primary';
const TEXT_DIR = path.join(ROOT, '_text');
const REPORT_DIR = process.env.REB_REPORT_DIR || 'D:/dd/reports';
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
const norm = (s) => String(s || '').toLowerCase().normalize('NFC');

const STOP = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself let's me more most my myself no nor not of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why will with would you your yours
le la les un une des du de d et est en dans pour par sur avec sans au aux ce cette ces son sa ses leur leurs il elle ils elles nous vous on ne pas plus comme mais ou où que qui quoi dont donc car
kandi ni na mu ku kwa kuri cyane cyane nka ariko cyangwa kuko niba ubu uko iki ibi icyo ibyo wa ba ya za bya cya ryo yo ko bo zo ho ako iki
page pages unit units chapter chapters lesson lessons topic topics activity activities figure table exercise exercises answer answers teacher teachers pupil pupils student students book books primary grade school rwanda national curriculum
the and for with this that from have are was were will can may not you your their they them its our
`.split(/\s+/).filter(Boolean)
);

const GENERIC = new Set(
  `page pages unit units chapter chapters lesson lessons topic topics activity activities figure figures table tables exercise exercises answer answers teacher teachers pupil pupils student students book books primary grade school rwanda national curriculum term terms week weeks period periods objective objectives competence competences content contents notes note introduction conclusion assessment evaluation method methods example examples`
    .split(/\s+/)
    .filter(Boolean)
);

function words(text) {
  const m = norm(text).match(/[a-zà-ÿ']{3,}/g) || [];
  return m.filter((w) => !STOP.has(w) && !/^\d+$/.test(w));
}

function freqMap(text) {
  const map = new Map();
  for (const w of words(text)) map.set(w, (map.get(w) || 0) + 1);
  return map;
}

function wordSet(text) {
  return new Set(words(text));
}

// The most frequent subject words in a document (its "core topics").
function coreTerms(fm, n = 100) {
  return [...fm.entries()]
    .filter(([w]) => w.length >= 4 && !GENERIC.has(w) && !STOP.has(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w);
}

function sharePresent(terms, set) {
  if (!terms.length) return 0;
  let hit = 0;
  for (const t of terms) if (set.has(t)) hit++;
  return hit / terms.length;
}

function keywords(text, minFreq = 2) {
  const fm = freqMap(text);
  const out = new Set();
  for (const [w, c] of fm) {
    if (c >= minFreq && w.length >= 4 && !GENERIC.has(w)) out.add(w);
  }
  // If a very short/clean text yields too few repeated words, fall back to freq>=1
  if (out.size < 30) {
    for (const [w, c] of fm) {
      if (w.length >= 5 && !GENERIC.has(w)) out.add(w);
    }
  }
  return out;
}

function topTerms(fm, n = 12) {
  return [...fm.entries()]
    .filter(([w]) => w.length >= 4 && !GENERIC.has(w) && !STOP.has(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([term, count]) => ({ term, count }));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function coverage(base, other) {
  if (!base.size) return 0;
  let hit = 0;
  for (const x of base) if (other.has(x)) hit++;
  return hit / base.size;
}

function cosine(fa, fb, universe) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const w of universe) {
    const a = fa.get(w) || 0;
    const b = fb.get(w) || 0;
    dot += a * b;
    na += a * a;
    nb += b * b;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const HEADING_RE =
  /^\s*(unit|chapter|topic|lesson|section|part|partie|leçon|unité|umugabane|igice|ikiganiro|somo)\b[\s:.\-–—0-9IVXLCDM]{0,12}(.{0,90})$/i;

function headings(text) {
  const out = new Set();
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.length < 4 || l.length > 120) continue;
    const m = l.match(HEADING_RE);
    if (!m) continue;
    let title = norm(`${m[1]} ${m[2]}`)
      .replace(/[^a-zà-ÿ0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (title.length >= 4) out.add(title);
  }
  return out;
}

function levelForGrade(g) {
  const n = Number(String(g).replace(/\D/g, ''));
  return n <= 2 ? 'beginner' : n <= 4 ? 'intermediate' : 'advanced';
}

function fmtPct(x) {
  return `${Math.round(x * 100)}%`;
}

function loadCache() {
  const files = fs.readdirSync(TEXT_DIR).filter((f) => f.endsWith('.txt'));
  const map = new Map();
  for (const f of files) {
    const [grade, type, ...rest] = f.replace(/\.txt$/, '').split('_');
    const subject = rest.join('_');
    const text = readText(path.join(TEXT_DIR, f));
    map.set(`${grade}|${type}|${subject}`, {
      grade,
      type,
      subject,
      file: f,
      text,
      sha: crypto.createHash('sha256').update(text).digest('hex'),
      fm: freqMap(text),
    });
  }
  return map;
}

function main() {
  const cache = loadCache();
  const pairs = [];
  const missingTG = [];
  const missingPB = [];
  const flagged = [];

  const grades = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const subjects = [...new Set([...cache.values()].map((c) => c.subject))].sort();

  for (const grade of grades) {
    for (const subject of subjects) {
      const pb = cache.get(`${grade}|PB|${subject}`);
      const tg = cache.get(`${grade}|TG|${subject}`);
      if (pb && !tg) missingTG.push({ grade, subject });
      if (tg && !pb) missingPB.push({ grade, subject });
      if (!pb || !tg) continue;

      if (pb.sha === tg.sha) {
        flagged.push({
          grade,
          subject,
          issue: 'TG file is identical to the PB file (mislabeled upload at source)',
        });
        continue;
      }

      const pbKw = keywords(pb.text);
      const tgKw = keywords(tg.text);
      const universe = new Set([...pbKw, ...tgKw]);
      const pbWordsSet = wordSet(pb.text);
      const tgWordsSet = wordSet(tg.text);
      const tgCore = coreTerms(tg.fm);
      const pbCore = coreTerms(pb.fm);
      const jac = jaccard(pbKw, tgKw);
      const tgCoveredByPb = coverage(tgKw, pbKw);
      const pbCoveredByTg = coverage(pbKw, tgKw);
      const tgCoreCoveredByPb = sharePresent(tgCore, pbWordsSet);
      const pbCoreCoveredByTg = sharePresent(pbCore, tgWordsSet);
      const cos = cosine(pb.fm, tg.fm, universe);
      const pbHead = headings(pb.text);
      const tgHead = headings(tg.text);
      const headJaccard = jaccard(pbHead, tgHead);
      const headTgInPb = coverage(tgHead, pbHead);

      // Relative size: how much richer is the TG vs the PB
      const pbWords = pb.text.split(/\s+/).filter(Boolean).length;
      const tgWords = tg.text.split(/\s+/).filter(Boolean).length;

      // TG is normally a superset (adds pedagogy/answers), so the meaningful
      // signal is how much of the TG's core topics appear in the PB, plus how
      // much of the PB is reflected back in the TG.
      const score =
        tgCoreCoveredByPb * 0.4 + pbCoreCoveredByTg * 0.3 + cos * 0.15 + headJaccard * 0.15;

      pairs.push({
        grade,
        subject,
        level: levelForGrade(grade),
        pb: { words: pbWords, keywords: pbKw.size, headings: pbHead.size, top: topTerms(pb.fm) },
        tg: { words: tgWords, keywords: tgKw.size, headings: tgHead.size, top: topTerms(tg.fm) },
        metrics: {
          jaccard: jac,
          tgConceptsCoveredByPb: tgCoveredByPb,
          pbConceptsCoveredByTg: pbCoveredByTg,
          tgCoreTopicsCoveredByPb: tgCoreCoveredByPb,
          pbCoreTopicsCoveredByTg: pbCoreCoveredByTg,
          cosine: cos,
          headingJaccard: headJaccard,
          tgHeadingsCoveredByPb: headTgInPb,
          alignmentScore: score,
        },
        tgTopicsNotInPb: [...tgKw].filter((w) => !pbKw.has(w)).slice(0, 25),
      });
    }
  }

  pairs.sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject));

  const verdict = (s) =>
    s >= 0.75 ? 'High' : s >= 0.55 ? 'Moderate' : 'Low';

  const json = {
    generatedAt: new Date().toISOString(),
    sourceRoot: ROOT,
    note:
      'PB = Pupil Book (learner notes). TG = Teacher Guide. A TG is normally a superset (adds lesson plans, answers, methodology), so tgCoreTopicsCoveredByPb is the key check: it shows how much of the guide core is reflected in the pupil notes. pbCoreTopicsCoveredByTg shows how much of the pupil book appears in the guide.',
    totalFiles: cache.size,
    paired: pairs.length,
    missingTG,
    missingPB,
    flagged,
    pairs,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'primary_pb_tg_comparison.json'), JSON.stringify(json, null, 2), 'utf8');

  const lines = [];
  lines.push('# Primary Pupil Books vs Teacher Guides — Comparison Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: REB eLearning — *Revised Primary Textbooks, Syllabi, Content Distribution and Schemes of Work (2026)*`);
  lines.push('');
  lines.push('**Legend:** PB = Pupil Book (learner notes) · TG = Teacher Guide.');
  lines.push('`TG core→PB` = share of the teacher guide\'s 100 most frequent subject terms that also appear in the pupil book (the main alignment check).');
  lines.push('`PB core→TG` = share of the pupil book\'s core terms that reappear in the guide.');
  lines.push('A teacher guide is normally a superset, so `PB core→TG` is expected to be high; a low `TG core→PB` means the notes may omit topics the guide emphasises.');
  lines.push('Score blends core-topic coverage (70%), vocabulary cosine (15%) and heading overlap (15%).');
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Files extracted: **${cache.size}**`);
  lines.push(`- Comparable PB/TG pairs: **${pairs.length}**`);
  lines.push(`- Pupil books without a teacher guide: **${missingTG.length}**`);
  lines.push(`- Teacher guides without a pupil book: **${missingPB.length}**`);
  lines.push(`- Flagged issues: **${flagged.length}**`);
  lines.push('');
  lines.push('| Grade | Subject | PB words | TG words | TG core→PB | PB core→TG | Vocab Jaccard | Cosine | Score | Verdict |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const p of pairs) {
    lines.push(
      `| ${p.grade} | ${p.subject} | ${p.pb.words} | ${p.tg.words} | ${fmtPct(
        p.metrics.tgCoreTopicsCoveredByPb
      )} | ${fmtPct(p.metrics.pbCoreTopicsCoveredByTg)} | ${fmtPct(
        p.metrics.jaccard
      )} | ${fmtPct(p.metrics.cosine)} | ${fmtPct(p.metrics.alignmentScore)} | ${verdict(
        p.metrics.alignmentScore
      )} |`
    );
  }
  lines.push('');

  for (const grade of grades) {
    const gp = pairs.filter((p) => p.grade === grade);
    if (!gp.length) continue;
    lines.push(`## ${grade}`);
    lines.push('');
    for (const p of gp) {
      lines.push(`### ${p.subject} — ${verdict(p.metrics.alignmentScore)} alignment`);
      lines.push('');
      lines.push(
        `- PB: **${p.pb.words}** words, ${p.pb.keywords} key terms, ${p.pb.headings} headings`
      );
      lines.push(
        `- TG: **${p.tg.words}** words, ${p.tg.keywords} key terms, ${p.tg.headings} headings`
      );
      lines.push(`- TG core topics covered by PB: **${fmtPct(p.metrics.tgCoreTopicsCoveredByPb)}**`);
      lines.push(`- PB core topics covered by TG: **${fmtPct(p.metrics.pbCoreTopicsCoveredByTg)}**`);
      lines.push(
        `- Vocabulary Jaccard: ${fmtPct(p.metrics.jaccard)} · Cosine: ${fmtPct(p.metrics.cosine)} · Heading overlap: ${fmtPct(p.metrics.headingJaccard)}`
      );
      if (p.tgTopicsNotInPb.length) {
        lines.push(`- TG terms not found in PB (sample): ${p.tgTopicsNotInPb.slice(0, 15).join(', ')}`);
      }
      lines.push(
        `- Top PB terms: ${p.pb.top.slice(0, 8).map((t) => t.term).join(', ')}`
      );
      lines.push(
        `- Top TG terms: ${p.tg.top.slice(0, 8).map((t) => t.term).join(', ')}`
      );
      lines.push('');
    }
  }

  if (missingTG.length) {
    lines.push('## Pupil books with no Teacher Guide');
    lines.push('');
    missingTG.forEach((m) => lines.push(`- ${m.grade} — ${m.subject}`));
    lines.push('');
  }
  if (missingPB.length) {
    lines.push('## Teacher Guides with no Pupil Book');
    lines.push('');
    missingPB.forEach((m) => lines.push(`- ${m.grade} — ${m.subject}`));
    lines.push('');
  }
  if (flagged.length) {
    lines.push('## Flagged source issues');
    lines.push('');
    flagged.forEach((f) => lines.push(`- ${f.grade} ${f.subject}: ${f.issue}`));
    lines.push('');
  }

  const mdPath = path.join(REPORT_DIR, 'primary_pb_tg_comparison.md');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');

  console.log(`Pairs compared: ${pairs.length}`);
  console.log(`Missing TG: ${missingTG.length} | Missing PB: ${missingPB.length} | Flagged: ${flagged.length}`);
  pairs.forEach((p) =>
    console.log(
      `${p.grade} ${p.subject.padEnd(18)} TG→PB ${fmtPct(p.metrics.tgConceptsCoveredByPb).padStart(4)}  PB→TG ${fmtPct(
        p.metrics.pbConceptsCoveredByTg
      ).padStart(4)}  jaccard ${fmtPct(p.metrics.jaccard).padStart(4)}  score ${fmtPct(
        p.metrics.alignmentScore
      ).padStart(4)}  ${verdict(p.metrics.alignmentScore)}`
    )
  );
  console.log('\nMarkdown:', mdPath);
  console.log('JSON:', path.join(REPORT_DIR, 'primary_pb_tg_comparison.json'));
}

main();
