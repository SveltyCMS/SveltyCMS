/**
 * @file src/utils/seo/readability.ts
 * @description Utility for calculating Flesch-Kincaid readability scores.
 */

/**
 * Calculates the Flesch Reading Ease and Flesch-Kincaid Grade Level.
 *
 * Formula (Reading Ease): 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
 * Formula (Grade Level): 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
 */
export function calculateReadability(text: string) {
  if (!text || text.trim().length === 0) {
    return {
      readingEase: 0,
      gradeLevel: 0,
      words: 0,
      sentences: 0,
      syllables: 0,
    };
  }

  const cleanText = text.replace(/<[^>]*>/g, " "); // Strip HTML

  const sentences = cleanText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
  const words =
    cleanText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length || 1;

  let syllables = 0;
  const wordsList = cleanText.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];

  for (const word of wordsList) {
    syllables += countSyllables(word);
  }

  const readingEase = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  const gradeLevel = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;

  return {
    readingEase: Math.max(0, Math.min(100, Math.round(readingEase))),
    gradeLevel: Math.max(0, Math.round(gradeLevel * 10) / 10),
    words,
    sentences,
    syllables,
  };
}

/**
 * Simple syllable counter for English
 */
function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
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
