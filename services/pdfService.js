// PDF Service: Handles robust PDF extraction, text cleaning, normalization,
// pagination stripping, ligature resolution, and document structure analysis.
const pdfParse = require('pdf-parse');

/**
 * Clean and normalize text extracted from PDF.
 * Removes pagination artifacts, headers/footers, broken hyphenations,
 * excess whitespace, and unprintable glyphs.
 */
const cleanPdfText = (rawText = '') => {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove form feed page breaks
  text = text.replace(/\f/g, '\n\n');

  // 3. Remove common running page numbers and headers/footers:
  // e.g. "Page 12 of 80", "12 / 80", "Page 12", "- 12 -"
  text = text.replace(/^[ \t]*(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s*\/\s*\d+|[-—]\s*\d+\s*[-—])[ \t]*$/gim, '');

  // 4. Merge words hyphenated across line breaks:
  // e.g. "multi-\nplication" -> "multiplication"
  text = text.replace(/(\b[a-zA-Z]{2,})-\s*\n\s*([a-zA-Z]{2,}\b)/g, '$1$2');

  // 5. Replace non-breaking spaces and unusual whitespace with standard space
  text = text.replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ');

  // 6. Fix common ligature representations if corrupted
  text = text
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl');

  // 7. Remove control characters (except newline, tab)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 8. Join soft wrapped lines within sentences while preserving paragraphs (2+ newlines)
  const paragraphs = text.split(/\n{2,}/);
  const cleanedParagraphs = paragraphs.map((p) => {
    // If paragraph has internal single newlines not followed by bullet or numbered list, join them
    const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
    const joined = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isListItem = /^([•\-*]|\d+[\.)])\s+/.test(line);
      const isHeader = /^(chapter|unit|lesson|section|part)\b/i.test(line);

      if (joined.length === 0 || isListItem || isHeader) {
        joined.push(line);
      } else {
        const prev = joined[joined.length - 1];
        // If previous line ends with hyphen or punctuation like period, keep separate or space
        if (/[.!?:;]$/.test(prev)) {
          joined.push(line);
        } else {
          joined[joined.length - 1] = `${prev} ${line}`;
        }
      }
    }
    return joined.join('\n');
  });

  text = cleanedParagraphs.filter((p) => p.trim().length > 0).join('\n\n');

  // 9. Collapse multiple spaces
  text = text.replace(/[ \t]{2,}/g, ' ').trim();

  return text;
};

/**
 * Computes pedagogical statistics from text.
 */
const computeTextStats = (text = '', numPages = 1) => {
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const characterCount = text.length;

  // Average reading speed for learners: ~180-200 words per minute
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 180));

  return {
    wordCount,
    characterCount,
    readingTimeMinutes,
    pageCount: numPages,
  };
};

/**
 * Extracts and cleans PDF buffer with metadata and statistics.
 */
const extractAndCleanPdf = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    const rawText = data.text || '';
    const cleanText = cleanPdfText(rawText);
    const numPages = data.numpages || 1;
    const stats = computeTextStats(cleanText, numPages);

    return {
      rawText,
      cleanText,
      numPages,
      info: data.info || {},
      stats,
    };
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    const err = new Error(`Failed to extract text from PDF: ${error.message}`);
    err.statusCode = 422;
    throw err;
  }
};

/**
 * Detects chapters or sections in an educational text.
 */
const detectChapters = (text = '') => {
  const chapterRegex = /(?:\n|^)(?:Chapter|Unit|Lesson|Topic|Module|Part)\s+([0-9IVXLCDM]+)[:.\s-]*([^\n]{2,80})/gi;
  const matches = [];
  let match;

  while ((match = chapterRegex.exec(text)) !== null) {
    matches.push({
      chapterNumber: match[1],
      title: match[2].trim(),
      startIndex: match.index,
    });
  }

  // Calculate sections slices
  if (matches.length > 0) {
    return matches.map((m, idx) => {
      const next = matches[idx + 1];
      const sectionText = next
        ? text.slice(m.startIndex, next.startIndex).trim()
        : text.slice(m.startIndex).trim();
      return {
        ...m,
        content: sectionText,
        wordCount: sectionText.split(/\s+/).filter(Boolean).length,
      };
    });
  }

  return [];
};

module.exports = {
  cleanPdfText,
  computeTextStats,
  extractAndCleanPdf,
  detectChapters,
};
