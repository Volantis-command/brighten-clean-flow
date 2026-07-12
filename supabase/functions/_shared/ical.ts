export interface ParsedICalEvent {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
}

export function parseICalEvents(icalText: string): ParsedICalEvent[] {
  const events: ParsedICalEvent[] = [];
  const unfolded = icalText.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT');
  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index].split('END:VEVENT')[0];
    const uid = block.match(/(?:^|\r?\n)UID[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    const rawSummary = block.match(/(?:^|\r?\n)SUMMARY[^:]*:([^\r\n]+)/i)?.[1]?.trim() || '';
    const summary = rawSummary.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    const dtstart = block.match(/(?:^|\r?\n)DTSTART[^:]*:(\d{8})/i)?.[1] || '';
    const dtend = block.match(/(?:^|\r?\n)DTEND[^:]*:(\d{8})/i)?.[1] || '';
    if (uid && dtend) events.push({ uid, summary, dtstart, dtend });
  }
  return events;
}

export function icalDateToISO(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid iCal date: ${value}`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
