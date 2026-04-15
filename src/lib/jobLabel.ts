/**
 * Canonical label for a job in any list/card/header.
 *
 * Brendan's rule: every job should default to the client's name; admins can
 * override to a custom property name. Never show "Unknown" — that's a code
 * smell, the data is almost always there in some form.
 *
 * Fallback chain (most specific first):
 *   1. properties.property_name — explicit name set on the property record
 *   2. job.client_name — name captured at quote time, stored on the job
 *   3. properties.client_name — name on the property record
 *   4. job.property_address — short address as last resort
 *   5. "Untitled job" — only if literally everything is null
 *
 * Pass either a job (with `properties` join) OR raw fields. Both shapes work.
 */

export interface JobLabelInput {
  properties?: {
    property_name?: string | null;
    client_name?: string | null;
    address?: string | null;
  } | null;
  property_name?: string | null;
  client_name?: string | null;
  property_address?: string | null;
  address?: string | null;
}

export function jobLabel(job: JobLabelInput | null | undefined): string {
  if (!job) return 'Untitled job';

  return (
    job.properties?.property_name ||
    job.property_name ||
    job.client_name ||
    job.properties?.client_name ||
    job.property_address ||
    job.properties?.address ||
    job.address ||
    'Untitled job'
  );
}

/** Short version for tight calendar cells — drops "Property" suffix etc. */
export function jobLabelShort(job: JobLabelInput | null | undefined, maxWords = 3): string {
  const full = jobLabel(job);
  if (full === 'Untitled job') return full;
  return full.split(/\s+/).slice(0, maxWords).join(' ');
}
