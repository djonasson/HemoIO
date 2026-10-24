/**
 * The reviewed files an import saves: a file left without values (a failed
 * file the user did not fill in) is not saved, but stays in the review so
 * going back keeps it and its edits
 */
export function resultsToSave<T extends { editedBiomarkers: readonly unknown[] }>(
  results: readonly T[]
): T[] {
  return results.filter((result) => result.editedBiomarkers.length > 0);
}
