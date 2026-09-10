// ============================================================================
// Which cleans get the guided photo report.
//
// Only Airbnb turnovers. Residential and deep cleans finish with one question,
// "anything to report?", then clock off. No photos.
//
// There is no clean type column on jobs. A deep clean is recorded by the
// booking flow as the first line of the job notes ("Deep Clean — Name") and
// on the linked quote, so both are checked.
// ============================================================================

type QuoteType = { clean_type?: string | null; service_type?: string | null } | null | undefined;

export function isDeepCleanJob(job: any, quote?: QuoteType): boolean {
  const firstLine = String(job?.notes ?? '').split('\n')[0].trim();
  if (/^deep clean\b/i.test(firstLine)) return true;
  return /deep/i.test(`${quote?.clean_type ?? ''} ${quote?.service_type ?? ''}`);
}

export function needsPhotoReport(property: any, job: any, quote?: QuoteType): boolean {
  return property?.client_type === 'airbnb' && !isDeepCleanJob(job, quote);
}
