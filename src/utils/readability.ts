/**
 * @file src/utils/seo/readability.ts
 * @description Utility for calculating Flesch-Kincaid readability scores with O(N) performance.
 */

/**
 * Calculates Flesch Reading Ease and Flesch-Kincaid Grade Level in a single pass.
 */
export function calculateReadability(text: string) {
  if (!text?.trim()) {
    return { readingEase: 0, gradeLevel: 0, words: 0, sentences: 0, syllables: 0 };
  }

  // 🚀 Performance: Strip HTML and whitespace in one go
  const clean = text.replace(/<[^>]*>/g, " ").trim();

  let words = 0;
  let sentences = 0;
  let syllables = 0;
  let inWord = false;

  // Single-pass scanner to avoid multiple O(N) array allocations
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    // Sentence boundary detection
    if (char === "." || char === "!" || char === "?") {
      sentences++;
    }

    // Word detection
    if (/\s/.test(char)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words++;
    }
  }

  // Syllable counting on extracted words
  const wordsList = clean.toLowerCase().match(/\b[a-z]{1,}\b/g) || [];
  for (let i = 0; i < wordsList.length; i++) {
    syllables += countSyllables(wordsList[i]);
  }

  const w = words || 1;
  const s = sentences || 1;

  const readingEase = 206.835 - 1.015 * (w / s) - 84.6 * (syllables / w);
  const gradeLevel = 0.39 * (w / s) + 11.8 * (syllables / w) - 15.59;

  return {
    readingEase: Math.max(0, Math.min(100, Math.round(readingEase))),
    gradeLevel: Math.max(0, Math.round(gradeLevel * 10) / 10),
    words: w,
    sentences: s,
    syllables,
  };
}

/**
 * Optimized syllable counter using non-backtracking patterns
 */
function countSyllables(word: string): number {
  if (word.length <= 3) return 1;

  // Strip common suffixes that don't add syllables
  let count =
    word
      .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
      .replace(/^y/, "")
      .match(/[aeiouy]{1,2}/g)?.length || 0;

  return Math.max(1, count);
}

/**
 * Returns a human-readable description of the reading ease
 */
export function getReadingEaseDescription(score: number): string {
  if (score >= 90) return "Very Easy (5th Grade)";
  if (score >= 80) return "Easy (6th Grade)";
  if (score >= 70) return "Fairly Easy (7th Grade)";
  if (score >= 60) return "Standard (8th & 9th Grade)";
  if (score >= 50) return "Fairly Difficult (High School)";
  if (score >= 30) return "Difficult (College)";
  return "Very Difficult (College Graduate)";
}
