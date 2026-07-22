import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Settings, X, ChevronDown, Bed, RotateCcw, Info, Send, Copy, Check, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// BRIGHTLY — AIRBNB QUOTE BUILDER
// All linen figures from real invoice (ex GST, 06/07/26).
// GP formula: sell = cost / (1 - GP%)  [margin, not markup]
// ============================================================

const BG    = '#0B0F17';
const CARD  = '#131920';
const GREEN = '#4ADE80';
const YELLOW = '#FEDB00';
const TEXT  = '#F8FAFC';
const MUTED = '#94A3B8';
const BORDER = 'rgba(74,222,128,0.18)';

type Rates = {
  labourRate: number;
  consumables: number;
  gpDefault: number;
  kingSheet: number;
  queenSheet: number;
  singleSheet: number;
  pillow: number;
  bathTowel: number;
  bathMat: number;
  handTowel: number;
  faceWasher: number;
  teaTowel: number;
  laundryBag: number;
  [key: string]: number;
};

const DEFAULT_RATES: Rates = {
  labourRate:  45,
  consumables: 5,
  gpDefault:   0.35,
  kingSheet:   3.52,
  queenSheet:  3.19,
  singleSheet: 2.97,
  pillow:      1.595,
  bathTowel:   2.09,
  bathMat:     1.65,
  handTowel:   1.375,
  faceWasher:  1.32,
  teaTowel:    1.10,
  laundryBag:  0.99,
};

type Packs = { bedQ: number; bedK: number; bedS: number; bath: number; kitchen: number };

function packs(r: Rates): Packs {
  return {
    bedQ: 3 * r.queenSheet + 4 * r.pillow + 2 * r.bathTowel + 2 * r.faceWasher,
    bedK: 3 * r.kingSheet  + 4 * r.pillow + 2 * r.bathTowel + 2 * r.faceWasher,
    bedS: 3 * r.singleSheet + 2 * r.pillow + 1 * r.bathTowel + 1 * r.faceWasher,
    bath: 2 * r.bathMat + 2 * r.handTowel,
    kitchen: 2 * r.teaTowel + r.laundryBag,
  };
}

const BED_CONFIGS = [
  { name: "1 Queen",         q: 1, k: 0, s: 0 },
  { name: "1 King",          q: 0, k: 1, s: 0 },
  { name: "1 Single",        q: 0, k: 0, s: 1 },
  { name: "2 Singles",       q: 0, k: 0, s: 2 },
  { name: "3 Singles",       q: 0, k: 0, s: 3 },
  { name: "Queen + Single",  q: 1, k: 0, s: 1 },
  { name: "King + Single",   q: 0, k: 1, s: 1 },
  { name: "2 Queens",        q: 2, k: 0, s: 0 },
  { name: "2 Kings",         q: 0, k: 2, s: 0 },
  { name: "Queen + 2 Singles", q: 1, k: 0, s: 2 },
  { name: "King + 2 Singles",  q: 0, k: 1, s: 2 },
];

function configLinen(cfgName: string, p: Packs): number {
  const c = BED_CONFIGS.find((x) => x.name === cfgName) ?? BED_CONFIGS[0];
  return c.q * p.bedQ + c.k * p.bedK + c.s * p.bedS;
}

const TYPES = [
  { name: "1 bed 1 bath", beds: 1, baths: 1, labour: 1.5  },
  { name: "2 bed 1 bath", beds: 2, baths: 1, labour: 1.75 },
  { name: "2 bed 2 bath", beds: 2, baths: 2, labour: 2.25 },
  { name: "3 bed 1 bath", beds: 3, baths: 1, labour: 2.15 },
  { name: "3 bed 2 bath", beds: 3, baths: 2, labour: 2.75 },
  { name: "3 bed 3 bath", beds: 3, baths: 3, labour: 3.0  },
  { name: "4 bed 1 bath", beds: 4, baths: 1, labour: 2.75 },
  { name: "4 bed 2 bath", beds: 4, baths: 2, labour: 3.25 },
  { name: "4 bed 3 bath", beds: 4, baths: 3, labour: 3.5  },
  { name: "4 bed 4 bath", beds: 4, baths: 4, labour: 4.0  },
  { name: "5 bed 2 bath", beds: 5, baths: 2, labour: 3.75 },
  { name: "5 bed 3 bath", beds: 5, baths: 3, labour: 4.0  },
  { name: "6 bed 3 bath", beds: 6, baths: 3, labour: 4.5  },
  { name: "6 bed 4 bath", beds: 6, baths: 4, labour: 5.0  },
];

// Residential — flat client sell rate, priced on property size × $70/hr.
// (Matches the client Instant Quote tool exactly: no linen, no consumables, no GP.)
const RESIDENTIAL_HOURLY = 70;

const fmt = (n: number) =>
  "$" + (isFinite(n) ? n : 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useCountUp(target: number, ms = 380) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  const start = useRef(0);
  useEffect(() => {
    from.current = val;
    start.current = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min((t - start.current) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from.current + (target - from.current) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

export default function AirbnbQuotePage() {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [typeIdx, setTypeIdx] = useState(2);
  const [rooms, setRooms] = useState<string[]>(Array(4).fill("1 Queen"));
  const [labourOverride, setLabourOverride] = useState(String(TYPES[2].labour));
  const [gp, setGp] = useState(0.35);
  const [incGst, setIncGst] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [mode, setMode] = useState<'airbnb' | 'residential'>('airbnb');

  // Send to client
  const [showSend, setShowSend] = useState(false);
  const [sendName, setSendName] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendPropName, setSendPropName] = useState('');
  const [sendNotes, setSendNotes] = useState('');
  const [photoMode, setPhotoMode] = useState<'free' | 'addon'>('addon'); // photo/damage report: free or $15 add-on
  const [sending, setSending] = useState(false);
  const [prefillLeadId, setPrefillLeadId] = useState<string | null>(null);
  const location = useLocation();
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const p = useMemo(() => packs(rates), [rates]);
  const type = TYPES[typeIdx];

  useEffect(() => {
    setRooms((prev) => {
      const next = [...prev];
      while (next.length < type.beds) next.push("1 Queen");
      return next.slice(0, type.beds);
    });
    setLabourOverride(String(TYPES[typeIdx].labour));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeIdx]);

  // ── Prefill from a lead (Leads → "Edit & send quote") ──
  // Load the lead's config into the builder + open the send drawer with their
  // contact details. Sending UPDATEs this same lead so it stays the one source
  // of truth (no duplicate row).
  useEffect(() => {
    const lead = (location.state as any)?.prefillLead;
    if (!lead) return;
    const leadMode: 'airbnb' | 'residential' =
      lead.form_data?.mode === 'residential' ? 'residential'
      : String(lead.clean_type || '').toLowerCase().includes('airbnb') ? 'airbnb'
      : lead.form_data?.mode === 'airbnb' ? 'airbnb' : 'residential';
    setMode(leadMode);
    const beds = Number(lead.bedrooms) || 0;
    const baths = Number(lead.bathrooms) || 0;
    let idx = TYPES.findIndex((t) => t.beds === beds && t.baths === baths);
    if (idx < 0) idx = TYPES.findIndex((t) => t.beds === beds);
    if (idx >= 0) setTypeIdx(idx);
    if (leadMode === 'airbnb') setGp(0.30); // instant quote shows clients 30% — match it
    setSendName([lead.first_name, lead.last_name].filter(Boolean).join(' ') || '');
    setSendPhone(lead.phone || '');
    setSendEmail(lead.email || '');
    setSendPropName(lead.address || '');
    setPrefillLeadId(lead.id || null);
    setSentUrl(null);
    setShowSend(true);
    // Clear router state so a refresh doesn't re-trigger the prefill.
    window.history.replaceState({}, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labourHrs    = labourOverride === "" ? type.labour : Number(labourOverride) || 0;
  const bedroomLinen = rooms.slice(0, type.beds).reduce((sum, cfg) => sum + configLinen(cfg, p), 0);
  const bathLinen    = type.baths * p.bath;
  const kitchenLinen = p.kitchen;
  const linenTotal   = bedroomLinen + bathLinen + kitchenLinen;
  const labourCost      = labourHrs * rates.labourRate;
  const consumablesTotal = rates.consumables * type.baths;
  const cost            = labourCost + linenTotal + consumablesTotal;
  // Airbnb: cost / (1 - GP). Residential: flat property-size hours × $70/hr sell.
  const sell         = mode === 'airbnb' ? cost / (1 - gp) : type.labour * RESIDENTIAL_HOURLY;
  const gpDollars    = sell - cost;
  const markup       = cost > 0 ? (sell - cost) / cost : 0;
  const display      = incGst ? sell * 1.1 : sell;
  const animated     = useCountUp(display);

  const setRoom = (i: number, val: string) =>
    setRooms((prev) => prev.map((r, idx) => (idx === i ? val : r)));

  const resetAll = () => {
    setRates(DEFAULT_RATES);
    setTypeIdx(2);
    setRooms(Array(4).fill("1 Queen"));
    setLabourOverride(String(TYPES[2].labour));
    setGp(0.35);
    setIncGst(false);
  };

  const handleSendQuote = async () => {
    if (!sendName.trim() || !sendPhone.trim()) return;
    setSending(true);
    try {
      const cleanType = mode === 'airbnb' ? 'Airbnb Turnover' : 'Standard Clean';
      const quoteHours = mode === 'airbnb' ? labourHrs : type.labour;
      const { data, error } = await supabase.functions.invoke('create-airbnb-quote-and-send', {
        body: {
          client_name: sendName.trim(),
          client_phone: sendPhone.trim(),
          client_email: sendEmail.trim() || null,
          property_name: sendPropName.trim() || null,
          clean_type: cleanType,
          bedrooms: type.beds,
          bathrooms: type.baths,
          bed_types: mode === 'airbnb' ? rooms.slice(0, type.beds) : null,
          labour_cost: labourCost,
          linen_cost: mode === 'airbnb' ? linenTotal : 0,
          consumables_cost: mode === 'airbnb' ? consumablesTotal : 0,
          total_cost: mode === 'airbnb' ? cost : sell,
          gp_percent: gp,
          sell_price_ex_gst: sell,
          sell_price_inc_gst: sell * 1.1,
          hours: quoteHours,
          linen_required: mode === 'airbnb' ? linenTotal > 0 : false,
          include_photo_report: true,
          photo_report_fee: photoMode === 'addon' ? 15 : 0,
          notes: sendNotes.trim() || null,
        },
      });
      if (error) throw error;
      setSentUrl(data.quote_url);

      // Keep everyone we send a quote to — lands in Leads as "Quote sent" so no
      // client's details are ever lost and you know the next action to take.
      // If we opened FROM a lead (Edit & send quote), UPDATE that same row so it
      // stays the single source of truth — no duplicate lead.
      const nameParts = sendName.trim().split(/\s+/);
      const leadRow = {
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || null,
        phone: sendPhone.trim(),
        email: sendEmail.trim() || null,
        address: sendPropName.trim() || null,
        clean_type: cleanType,
        bedrooms: type.beds,
        bathrooms: type.baths,
        estimated_hours: quoteHours,
        total_ex_gst: Math.round(sell * 100) / 100,
        total_inc_gst: Math.round(sell * 110) / 100,
        status: 'quote_sent',
        form_submitted_at: new Date().toISOString(),
        extra_notes: sendNotes.trim() || null,
        form_data: {
          source: 'quote_builder',
          mode,
          property_size: type.name,
          quote_url: data.quote_url,
          quoted_inc_gst: Math.round(sell * 110) / 100,
          photo_report_fee: photoMode === 'addon' ? 15 : 0,
        },
      };
      const leadWrite = prefillLeadId
        ? supabase.from('quote_requests').update(leadRow as any).eq('id', prefillLeadId)
        : supabase.from('quote_requests').insert(leadRow as any);
      leadWrite.then(({ error: leadErr }) => {
        if (leadErr) console.error('Lead capture failed (non-blocking):', leadErr);
      });
    } catch (e) {
      alert('Failed to send quote. Check connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!sentUrl) return;
    await navigator.clipboard.writeText(sentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const gpOptions = [0.3, 0.35, 0.4];

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", paddingBottom: 48 }}>

        {/* ---- STICKY HERO ---- */}
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: BG, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: "16px 20px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${GREEN}, ${YELLOW})` }} />
                <span style={{ color: TEXT, fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Quote Builder</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={resetAll} aria-label="Reset" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, cursor: "pointer" }}>
                  <RotateCcw size={16} color={MUTED} />
                </button>
                <button onClick={() => setShowRates(true)} aria-label="Edit rates" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, cursor: "pointer" }}>
                  <Settings size={16} color={GREEN} />
                </button>
              </div>
            </div>

            {/* Mode toggle — Airbnb (linen/config) vs Residential (hours-based) */}
            <div style={{ display: "flex", gap: 6, marginTop: 14, background: CARD, borderRadius: 12, padding: 4, border: `1px solid ${BORDER}` }}>
              {([["airbnb", "Airbnb / Short-Stay"], ["residential", "Residential"]] as ['airbnb' | 'residential', string][]).map(([m, label]) => {
                const active = mode === m;
                return (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: active ? GREEN : "transparent", color: active ? "#000" : MUTED, transition: "all .15s" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: MUTED, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {mode === 'airbnb' ? `${type.name} · Turnover` : `${type.name} · Standard clean`}
                </div>
                <div style={{ color: TEXT, fontWeight: 800, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.03em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(animated)}
                </div>
                <div style={{ height: 3, width: 92, marginTop: 6, borderRadius: 3, background: `linear-gradient(90deg, ${GREEN}, ${YELLOW})` }} />
              </div>
              <div style={{ textAlign: "right" }}>
                <button onClick={() => setIncGst((v) => !v)}
                  style={{ background: incGst ? GREEN : CARD, color: incGst ? '#000' : MUTED, border: `1px solid ${incGst ? GREEN : BORDER}`, borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {incGst ? "inc GST" : "ex GST"}
                </button>
                {mode === 'airbnb' ? (
                  <>
                    <div style={{ color: YELLOW, fontSize: 12, fontWeight: 600, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                      GP {fmt(gpDollars)}
                    </div>
                    <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
                      {(gp * 100).toFixed(0)}% margin
                    </div>
                  </>
                ) : (
                  <div style={{ color: MUTED, fontSize: 11, marginTop: 8 }}>
                    {type.labour}h × ${RESIDENTIAL_HOURLY}/hr
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 16px 0" }}>

          {/* ---- 1. PROPERTY SIZE (both modes) ---- */}
          <Section n="1" label="Property size">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map((t, i) => {
                const active = i === typeIdx;
                return (
                  <button key={t.name} onClick={() => setTypeIdx(i)}
                    style={{
                      border: active ? `1.5px solid ${GREEN}` : `1.5px solid ${BORDER}`,
                      background: active ? GREEN : CARD,
                      color: active ? '#000' : TEXT,
                      borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      transition: "all .15s",
                    }}>
                    {t.beds}<span style={{ opacity: 0.6 }}>bd</span> · {t.baths}<span style={{ opacity: 0.6 }}>ba</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {mode === 'residential' && (
            <div style={{ marginTop: -4, marginBottom: 18, textAlign: "center", fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              Standard residential clean, charged at ${RESIDENTIAL_HOURLY}/hr.
            </div>
          )}

          {mode === 'airbnb' && (<>
          {/* ---- 2. BED CONFIG ---- */}
          <Section n="2" label="Bed config per room">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rooms.slice(0, type.beds).map((cfg, i) => (
                <div key={i} style={{ background: CARD, borderRadius: 14, padding: "12px 14px", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${GREEN}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bed size={17} color={GREEN} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bedroom {i + 1}</div>
                    <div style={{ position: "relative", marginTop: 3 }}>
                      <select value={cfg} onChange={(e) => setRoom(i, e.target.value)}
                        style={{ width: "100%", border: "none", background: "transparent", fontSize: 15, fontWeight: 600, color: TEXT, paddingRight: 22, cursor: "pointer", fontFamily: "inherit", appearance: "none" as const }}>
                        {BED_CONFIGS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                      <ChevronDown size={15} color={MUTED} style={{ position: "absolute", right: 0, top: 3, pointerEvents: "none" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GREEN, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(configLinen(cfg, p))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ---- 3. LABOUR (Airbnb only) ---- */}
          <Section n="3" label="Confirm labour">
            <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
              {/* Hours row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Hours on site</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Suggested {type.labour}h</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input inputMode="decimal" value={labourOverride}
                    onChange={(e) => setLabourOverride(e.target.value.replace(/[^\d.]/g, ""))}
                    style={{ width: 62, textAlign: "center", border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "8px 6px", fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: "inherit", background: BG }} />
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 600, minWidth: 24 }}>hrs</span>
                </div>
              </div>
              {/* Rate row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Labour rate</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Total {fmt(labourCost)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>$</span>
                  <input inputMode="decimal" value={rates.labourRate}
                    onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")); setRates({ ...rates, labourRate: isNaN(v) ? 0 : v }); }}
                    style={{ width: 62, textAlign: "center", border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "8px 6px", fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: "inherit", background: BG }} />
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 600, minWidth: 24 }}>/hr</span>
                </div>
              </div>
            </div>
          </Section>

          {/* ---- 4. GP MARGIN ---- */}
          <Section n="4" label="GP margin">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {gpOptions.map((g) => {
                const active = Math.abs(gp - g) < 0.001;
                return (
                  <button key={g} onClick={() => setGp(g)}
                    style={{ flex: 1, border: active ? `1.5px solid ${GREEN}` : `1.5px solid ${BORDER}`, background: active ? GREEN : CARD, color: active ? '#000' : TEXT, borderRadius: 12, padding: "11px 0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    {(g * 100).toFixed(0)}%
                  </button>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 4, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "0 10px", background: CARD }}>
                <input inputMode="decimal" value={(gp * 100).toFixed(0)}
                  onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")); if (!isNaN(v)) setGp(Math.min(Math.max(v, 0), 90) / 100); }}
                  style={{ width: 34, textAlign: "center", border: "none", padding: "11px 0", fontSize: 15, fontWeight: 700, color: GREEN, fontFamily: "inherit", background: "transparent" }} />
                <span style={{ fontSize: 13, color: MUTED, fontWeight: 700 }}>%</span>
              </div>
            </div>
            {gp < 0.35 && (
              <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: "flex", gap: 5, alignItems: "center" }}>
                <Info size={12} /> Below 35% — portfolio/volume rate. Fine with a monthly clean minimum.
              </div>
            )}
          </Section>

          {/* ---- COST BREAKDOWN ---- */}
          <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, overflow: "hidden", marginTop: 6 }}>
            <button onClick={() => setShowBreakdown((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT }}>Cost breakdown</span>
              <ChevronDown size={17} color={MUTED} style={{ transform: showBreakdown ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
            {showBreakdown && (
              <div style={{ padding: "0 16px 14px" }}>
                <Line label="Labour"         sub={`${labourHrs}h × ${fmt(rates.labourRate)}`} val={labourCost} />
                {mode === 'airbnb' && (<>
                <Line label="Bedroom linen"  sub={`${type.beds} room${type.beds > 1 ? "s" : ""}`} val={bedroomLinen} />
                <Line label="Bathroom linen" sub={`${type.baths} × ${fmt(p.bath)}`} val={bathLinen} />
                <Line label="Kitchen linen"  sub="tea towel + bag" val={kitchenLinen} />
                <Line label="Consumables" sub={`${type.baths} bath${type.baths > 1 ? 's' : ''} × ${fmt(rates.consumables)}`} val={consumablesTotal} />
                </>)}
                <div style={{ height: 1, background: BORDER, margin: "8px 0" }} />
                <Line label="Total cost" val={cost} bold />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "12px 14px", background: BG, borderRadius: 12, border: `1px solid ${BORDER}` }}>
                  <div>
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sell price {incGst ? "(inc GST)" : "(ex GST)"}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: GREEN, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(display)}</div>
                  </div>
                  <div style={{ textAlign: "right", alignSelf: "flex-end" }}>
                    <div style={{ fontSize: 12, color: YELLOW, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>GP {fmt(gpDollars)}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>markup {(markup * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, textAlign: "center", fontSize: 10.5, color: MUTED, lineHeight: 1.6 }}>
            Linen rates from real invoice (ex GST, 06/07/26).<br />
            Confirm labour is fully-loaded (super + workcover + insurance).
          </div>
          </>)}

          {/* ---- SEND TO CLIENT ---- */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => { setShowSend(true); setSentUrl(null); }}
              style={{
                width: "100%", padding: "14px", borderRadius: 14,
                background: `linear-gradient(135deg, ${GREEN}, #22c55e)`,
                color: '#000', fontWeight: 800, fontSize: 15,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: `0 0 24px ${GREEN}55`,
              }}
            >
              <Send size={17} />
              Send Quote to Client
            </button>
          </div>
        </div>
      </div>

      {/* ---- SEND DRAWER ---- */}
      {showSend && (
        <div
          onClick={() => !sending && setShowSend(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: CARD, width: "100%", maxWidth: 520,
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              maxHeight: "92vh", overflowY: "auto",
              padding: "20px 18px 40px", border: `1px solid ${BORDER}`,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, position: "sticky", top: 0, background: CARD, paddingBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>Send Quote</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {type.name} · {fmt(sell)} ex GST
                </div>
              </div>
              <button onClick={() => setShowSend(false)} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, cursor: "pointer" }}>
                <X size={18} color={TEXT} />
              </button>
            </div>

            {sentUrl ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${GREEN}22`, border: `2px solid ${GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Check size={26} color={GREEN} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Quote Sent!</div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 18 }}>
                  SMS sent to {sendPhone}. They'll receive the link shortly.
                </div>
                {/* Quote URL */}
                <div style={{ background: BG, borderRadius: 12, padding: "10px 14px", border: `1px solid ${BORDER}`, marginBottom: 12, textAlign: "left" }}>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Quote link</div>
                  <div style={{ fontSize: 11, color: MUTED, wordBreak: "break-all" }}>{sentUrl}</div>
                </div>
                <button
                  onClick={handleCopyLink}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12,
                    background: copied ? GREEN : CARD,
                    color: copied ? '#000' : TEXT,
                    border: `1.5px solid ${copied ? GREEN : BORDER}`,
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  }}
                >
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
                </button>
                <button
                  onClick={() => { setSentUrl(null); setSendName(''); setSendPhone(''); setSendEmail(''); setSendPropName(''); setSendNotes(''); }}
                  style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 12, background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Send another quote
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <SendField label="Client name *" value={sendName} onChange={setSendName} placeholder="e.g. Andrew Smith" />
                <SendField label="Mobile number *" value={sendPhone} onChange={setSendPhone} placeholder="04xx xxx xxx" type="tel" />
                <SendField label="Email (optional)" value={sendEmail} onChange={setSendEmail} placeholder="client@example.com" type="email" />
                <SendField label="Property name / address" value={sendPropName} onChange={setSendPropName} placeholder="e.g. Broadwater Lux, 12 Marine Pde" />
                <SendField label="Notes for client (optional)" value={sendNotes} onChange={setSendNotes} placeholder="e.g. Includes linen changeover for all bedrooms" multiline />

                {/* Photo / damage reporting — free or a $15 add-on the client can toggle */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: MUTED, marginBottom: 6 }}>
                    Photo &amp; damage report
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([["free", "Free ($0)"], ["addon", "Add-on ($15)"]] as ['free' | 'addon', string][]).map(([m, label]) => {
                      const active = photoMode === m;
                      return (
                        <button key={m} type="button" onClick={() => setPhotoMode(m)}
                          style={{ flex: 1, border: `1.5px solid ${active ? GREEN : BORDER}`, background: active ? GREEN : BG, color: active ? '#000' : TEXT, borderRadius: 12, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                    Client sees a “Photo reporting” toggle at {photoMode === 'addon' ? '+$15' : '$0'}. Damage reporting is always listed as included.
                  </div>
                </div>

                <button
                  onClick={handleSendQuote}
                  disabled={sending || !sendName.trim() || !sendPhone.trim()}
                  style={{
                    marginTop: 4, width: "100%", padding: "14px", borderRadius: 14,
                    background: (!sendName.trim() || !sendPhone.trim()) ? BORDER : GREEN,
                    color: '#000', fontWeight: 800, fontSize: 15, border: "none",
                    cursor: (!sendName.trim() || !sendPhone.trim()) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  <Send size={16} />
                  {sending ? "Sending…" : "Send via SMS"}
                </button>

                <div style={{ textAlign: "center", fontSize: 11, color: MUTED }}>
                  Client receives an SMS with a link to view, adjust & accept the quote.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- RATES DRAWER ---- */}
      {showRates && (
        <div onClick={() => setShowRates(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: CARD, width: "100%", maxWidth: 520, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "88vh", overflowY: "auto", padding: "18px 18px 36px", border: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "sticky", top: 0, background: CARD, paddingBottom: 6 }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: TEXT }}>Rates</span>
              <button onClick={() => setShowRates(false)} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, cursor: "pointer" }}>
                <X size={18} color={TEXT} />
              </button>
            </div>

            <RateGroup title="Core">
              <RateInput label="Labour $/hr" flag="confirm fully-loaded" value={rates.labourRate} onChange={(v) => setRates({ ...rates, labourRate: v })} />
              <RateInput label="Consumables $/bathroom" value={rates.consumables} onChange={(v) => setRates({ ...rates, consumables: v })} />
            </RateGroup>

            <RateGroup title="Linen — per item (ex GST)">
              {([
                ["King flat sheet",       "kingSheet"],
                ["Queen flat sheet",      "queenSheet"],
                ["King single flat sheet","singleSheet"],
                ["Pillowcase",            "pillow"],
                ["Bath towel",            "bathTowel"],
                ["Bath mat",              "bathMat"],
                ["Hand towel",            "handTowel"],
                ["Face washer",           "faceWasher"],
                ["Tea towel",             "teaTowel"],
                ["Laundry bag",           "laundryBag"],
              ] as [string, string][]).map(([label, key]) => (
                <RateInput key={key} label={label} value={rates[key]} step={0.005} onChange={(v) => setRates({ ...rates, [key]: v })} />
              ))}
            </RateGroup>

            <RateGroup title="Derived pack costs (auto)">
              <PackRow label="Queen bed pack" val={p.bedQ} />
              <PackRow label="King bed pack"  val={p.bedK} />
              <PackRow label="Single bed pack" val={p.bedS} />
              <PackRow label="Bathroom pack"  val={p.bath} />
              <PackRow label="Kitchen pack"   val={p.kitchen} />
            </RateGroup>

            <button onClick={() => setRates(DEFAULT_RATES)}
              style={{ marginTop: 14, width: "100%", background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 700, color: TEXT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <RotateCcw size={15} /> Reset to invoice defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function Section({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, background: GREEN, color: '#000', fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: MUTED }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function Line({ label, sub, val, bold }: { label: string; sub?: string; val: number; bold?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
      <div>
        <span style={{ fontSize: 14, fontWeight: bold ? 700 : 500, color: TEXT }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: MUTED, marginLeft: 7 }}>{sub}</span>}
      </div>
      <span style={{ fontSize: 14, fontWeight: bold ? 800 : 600, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{fmt(val)}</span>
    </div>
  );
}

function RateGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: GREEN, marginBottom: 7 }}>{title}</div>
      <div style={{ background: BG, borderRadius: 14, overflow: "hidden", border: `1px solid ${BORDER}` }}>{children}</div>
    </div>
  );
}

function RateInput({ label, value, onChange, step = 0.01, flag }: { label: string; value: number; onChange: (v: number) => void; step?: number; flag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: TEXT }}>{label}</div>
        {flag && <div style={{ fontSize: 10, color: YELLOW, fontWeight: 600 }}>{flag}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>$</span>
        <input inputMode="decimal" value={value} step={step}
          onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")); onChange(isNaN(v) ? 0 : v); }}
          style={{ width: 66, textAlign: "right", border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: "7px 8px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", background: CARD }} />
      </div>
    </div>
  );
}

function PackRow({ label, val }: { label: string; val: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 13.5, color: TEXT }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: GREEN, fontVariantNumeric: "tabular-nums" }}>{fmt(val)}</span>
    </div>
  );
}

function SendField({ label, value, onChange, placeholder, type = "text", multiline = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; multiline?: boolean;
}) {
  const base: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 10,
    padding: "10px 12px", fontSize: 14, fontWeight: 500, color: TEXT,
    fontFamily: "inherit", background: BG, marginTop: 4,
  };
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: MUTED }}>{label}</div>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
            style={{ ...base, resize: "vertical" as const }} />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            style={base} />
      }
    </div>
  );
}
