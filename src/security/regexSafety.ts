// Heuristic, defense-in-depth check for regex patterns supplied by API callers
// (allowRequestPattern/rejectRequestPattern). These patterns are compiled and
// tested synchronously against every sub-resource URL on Node's single event
// loop, so a catastrophic-backtracking pattern can freeze the entire server,
// not just the request that submitted it.
//
// This is NOT a mathematical guarantee against ReDoS — it rejects the common
// catastrophic-backtracking shapes (nested quantifiers, quantified
// alternation) but a sufficiently creative pattern could still slip through.
// The render pipeline's `actionTimeout` ceiling is the backstop.

const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)[+*]/;
const QUANTIFIED_ALTERNATION = /\([^()]*\|[^()]*\)[+*]/;

export function isSafeRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  if (NESTED_QUANTIFIER.test(pattern)) return false;
  if (QUANTIFIED_ALTERNATION.test(pattern)) return false;
  return true;
}
