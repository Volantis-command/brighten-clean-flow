// Deriving a suburb from a free-text address.
//
// 94 of the 115 properties have no `suburb` on the row — the column only ever
// got filled in for the Airbnb ones. The roster shows suburb and not the full
// street, so without a fallback most of it would show a property name and no
// place at all, which is the one thing a cleaner reading a roster needs.
//
// An AU address puts the locality AFTER the street type, so cut there: drop a
// trailing country, postcode and state, then take what follows the last
// street-type word. Deliberately conservative — when the shape is not
// recognised this returns null and the caller shows nothing, rather than
// guessing and printing half a street name as a suburb. A wrong suburb sends
// someone to the wrong side of the Gold Coast; a blank one just makes them
// open the job.

const STREET_TYPES =
  /\b(st|street|rd|road|av|ave|avenue|dr|dve|drive|ct|crt|court|cres|crescent|pl|place|ln|lane|way|pde|prd|parade|tce|terrace|blvd|boulevard|hwy|hway|highway|cct|circuit|cl|close|esp|esplanade|grv|grove|pkwy|parkway|sq|square|mews|rise|ridge|walk|loop|keys)\b/gi;

/** A one-to-three-word locality, Title Cased, or null when unsure. */
export function localityFrom(address: string | null | undefined): string | null {
  if (!address) return null;
  let s = String(address).trim();
  if (!s) return null;

  // Country, postcode and state stack up at the end in any order
  // ("Kingscliff, NSW 2487, Australia"), so strip repeatedly, not once.
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = s.replace(/[,\s]*\baustralia\b\s*$/i, '');
    s = s.replace(/[,\s]*\b\d{4}\b\s*$/, '');
    s = s.replace(/[,\s]*\b(qld|nsw|vic|sa|wa|tas|nt|act)\b\s*$/i, '');
    s = s.replace(/[,.\s]+$/, '').trim();
    if (s === before) break;
  }
  if (!s) return null;

  STREET_TYPES.lastIndex = 0;
  let cut = -1;
  for (let m = STREET_TYPES.exec(s); m; m = STREET_TYPES.exec(s)) cut = m.index + m[0].length;
  let tail = cut > -1 ? s.slice(cut).replace(/^[,.\s]+/, '').trim() : '';

  // No street type, or nothing after it: fall back to the last comma segment,
  // which is where "Reflections Tower, Coolangatta" keeps its locality.
  if (!tail && s.includes(',')) tail = s.split(',').pop()!.trim();
  if (!tail) return null;

  // A locality is one to three words with no digits in it. Anything else means
  // the parse went wrong, so say nothing rather than something misleading.
  const words = tail.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  if (/\d/.test(tail)) return null;

  // A tail ending in a street type is a street, not a suburb — the shape
  // "Waterline Apartments, Broadbeach Boulevard" otherwise yields "Broadbeach
  // Boulevard". No Gold Coast suburb ends in one of these words, so treating
  // it as a failed parse is safe, and a blank beats a wrong place to drive to.
  STREET_TYPES.lastIndex = 0;
  if (new RegExp(`^(?:${STREET_TYPES.source.slice(2, -2)})$`, 'i').test(words[words.length - 1])) {
    return null;
  }

  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
