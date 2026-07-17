import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { Bed, ChevronDown, ShieldCheck, Camera, Clock, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TYPES, BED_CONFIGS, airbnbQuote, residentialQuote, type QuoteResult,
} from "@/lib/airbnbQuotePricing";

/* ── Brand tokens (match the admin Airbnb Quote calculator) ── */
const BG = "#0B0F17";
const CARD = "#131920";
const GREEN = "#4ADE80";
const YELLOW = "#FEDB00";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const BORDER = "rgba(74,222,128,0.18)";

const fmt = (n: number) =>
  "$" + (isFinite(n) ? n : 0).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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

type Mode = "airbnb" | "residential";

export default function InstantQuotePage() {
  const [phase, setPhase] = useState<"quote" | "book" | "done">("quote");
  const [mode, setMode] = useState<Mode>("airbnb");

  // shared property config
  const [typeIdx, setTypeIdx] = useState(2); // 2 bed 2 bath
  const [rooms, setRooms] = useState<string[]>(Array(4).fill("1 Queen"));
  const [linenIncluded, setLinenIncluded] = useState(true);
  const [consumablesIncluded, setConsumablesIncluded] = useState(true);

  const type = TYPES[typeIdx];

  useEffect(() => {
    setRooms((prev) => {
      const next = [...prev];
      while (next.length < type.beds) next.push("1 Queen");
      return next.slice(0, type.beds);
    });
  }, [type.beds]);

  const quote: QuoteResult = useMemo(() => {
    if (mode === "residential") return residentialQuote(typeIdx);
    return airbnbQuote({ typeIdx, rooms, labourHrs: type.labour, linenIncluded, consumablesIncluded });
  }, [mode, typeIdx, rooms, type.labour, linenIncluded, consumablesIncluded]);

  const priceIncGst = quote.sellIncGst;
  const animated = useCountUp(priceIncGst);

  const setRoom = (i: number, val: string) =>
    setRooms((prev) => prev.map((r, idx) => (idx === i ? val : r)));

  // booking form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("11:00");
  // airbnb-only property details
  const [accessMethod, setAccessMethod] = useState("Lockbox");
  const [accessCode, setAccessCode] = useState("");
  const [platform, setPlatform] = useState("Airbnb");
  const [parking, setParking] = useState("Street parking");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cleanType = mode === "airbnb" ? "Airbnb / Short-Stay Turnover" : "Standard Clean";

  const submit = async () => {
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      toast.error("Name, mobile and property address are required");
      return;
    }
    if (mode === "residential" && !preferredDate) {
      toast.error("Please pick a preferred date");
      return;
    }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");
      const { error } = await supabase.from("quote_requests").insert({
        first_name: firstName,
        last_name: lastName,
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim(),
        clean_type: cleanType,
        bedrooms: type.beds,
        bathrooms: type.baths,
        estimated_hours: quote.hours,
        total_ex_gst: Math.round(quote.sellExGst * 100) / 100,
        total_inc_gst: Math.round(quote.sellIncGst * 100) / 100,
        preferred_date: preferredDate || null,
        preferred_time: preferredTime || null,
        status: "booking_requested",
        form_submitted_at: new Date().toISOString(),
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        extra_notes: notes.trim() || null,
        addons: mode === "airbnb"
          ? { linen_required: linenIncluded, consumables: consumablesIncluded }
          : null,
        form_data: {
          source: "instant_quote",
          mode,
          property_size: type.name,
          bed_config: mode === "airbnb" ? rooms.slice(0, type.beds) : null,
          linen_required: mode === "airbnb" ? linenIncluded : false,
          consumables: mode === "airbnb" ? consumablesIncluded : false,
          quoted_inc_gst: Math.round(quote.sellIncGst * 100) / 100,
          access_method: mode === "airbnb" ? accessMethod : null,
          access_code: mode === "airbnb" ? accessCode || null : null,
          platform: mode === "airbnb" ? platform : null,
          parking: mode === "airbnb" ? parking : null,
        },
      } as any);
      if (error) throw error;

      // Admin heads-up (existing, deployed). Non-blocking.
      supabase.functions.invoke("send-quote-notification", {
        body: { type: "intake_submitted", client_phone: phone.trim(), client_name: firstName, clean_type: cleanType, address: address.trim() },
      }).catch(() => {});

      if (typeof (window as any).gtag === "function") {
        (window as any).gtag("event", "conversion", {
          send_to: "AW-18046329250/gQZiCLyh9qocEKLDlJ1D",
          value: Math.round(quote.sellIncGst), currency: "AUD",
        });
      }
      setPhase("done");
      window.scrollTo(0, 0);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong — please call 0418 878 707");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Confirmation ── */
  if (phase === "done") {
    return (
      <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${GREEN}, ${YELLOW})`, marginBottom: 28 }} />
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${GREEN}22`, border: `2px solid ${GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
          <CheckCircle2 size={40} color={GREEN} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>
          {mode === "airbnb" ? "Quote accepted" : "Booking requested"}
        </h1>
        <p style={{ color: MUTED, maxWidth: 380, fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
          Your {type.name} {mode === "airbnb" ? "turnover" : "clean"} is <b style={{ color: TEXT }}>{fmt(priceIncGst)}</b> inc GST.
          {mode === "residential"
            ? ` We'll confirm your ${preferredDate} slot and text you on ${phone}.`
            : " We've got your property details — we'll set everything up and text you to lock it in."}
        </p>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "16px 28px", color: MUTED, fontSize: 14 }}>
          <p style={{ fontWeight: 700, color: TEXT, margin: "0 0 2px" }}>Questions?</p>
          <p style={{ margin: 0 }}>Call us on <span style={{ color: YELLOW }}>0418 878 707</span></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", paddingBottom: 120 }}>

        {/* ── Sticky hero ── */}
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: BG, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ padding: "16px 20px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${GREEN}, ${YELLOW})` }} />
              <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Instant Quote</span>
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 6, marginTop: 14, background: CARD, borderRadius: 12, padding: 4, border: `1px solid ${BORDER}` }}>
              {([["airbnb", "Airbnb / Short-Stay"], ["residential", "Residential"]] as [Mode, string][]).map(([m, label]) => {
                const active = mode === m;
                return (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                      background: active ? GREEN : "transparent", color: active ? "#000" : MUTED, transition: "all .15s" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ color: MUTED, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {type.name} · {mode === "airbnb" ? "Turnover" : "Standard clean"}
              </div>
              <div style={{ fontWeight: 800, fontSize: 46, lineHeight: 1.05, letterSpacing: "-0.03em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                {fmt(animated)} <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>inc GST</span>
              </div>
              <div style={{ height: 3, width: 92, marginTop: 8, borderRadius: 3, background: `linear-gradient(90deg, ${GREEN}, ${YELLOW})` }} />
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 16px 0" }}>
          {/* trust chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {[[ShieldCheck, "Police-checked & insured"], [Camera, "Photo report every clean"], [Clock, "24hr turnaround"]].map(([Icon, t]: any) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, color: MUTED }}>
                <Icon size={14} color={GREEN} /> {t}
              </div>
            ))}
          </div>

          {phase === "quote" && (
            <>
              <Section n="1" label="Property size">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {TYPES.map((t, i) => {
                    const active = i === typeIdx;
                    return (
                      <button key={t.name} onClick={() => setTypeIdx(i)}
                        style={{ border: `1.5px solid ${active ? GREEN : BORDER}`, background: active ? GREEN : CARD, color: active ? "#000" : TEXT,
                          borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
                        {t.beds}<span style={{ opacity: 0.6 }}>bd</span> · {t.baths}<span style={{ opacity: 0.6 }}>ba</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {mode === "airbnb" && (
                <>
                  <Section n="2" label="Linen & extras">
                    <ToggleRow label="Linen change included" sub="We supply & launder hotel-grade linen" value={linenIncluded} onChange={setLinenIncluded} />
                    <div style={{ height: 10 }} />
                    <ToggleRow label="Consumables kit" sub="Soap, amenities & essentials restocked" value={consumablesIncluded} onChange={setConsumablesIncluded} />
                  </Section>

                  {linenIncluded && (
                    <Section n="3" label="Bed configuration">
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
                                  style={{ width: "100%", border: "none", background: "transparent", fontSize: 15, fontWeight: 600, color: TEXT, paddingRight: 22, cursor: "pointer", fontFamily: "inherit", appearance: "none" }}>
                                  {BED_CONFIGS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                                <ChevronDown size={15} color={MUTED} style={{ position: "absolute", right: 0, top: 3, pointerEvents: "none" }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}

              <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                {mode === "airbnb"
                  ? "Includes full turnover clean" + (linenIncluded ? ", linen" : "") + (consumablesIncluded ? " & consumables." : ".")
                  : "Standard residential clean, charged at $70/hr."}
              </div>
            </>
          )}

          {phase === "book" && (
            <>
              <Section n="1" label={mode === "residential" ? "Book your clean" : "Your details"}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field label="Full name *" value={fullName} onChange={setFullName} placeholder="Jane Smith" />
                  <Field label="Mobile *" value={phone} onChange={setPhone} placeholder="0412 345 678" type="tel" />
                  <Field label="Email" value={email} onChange={setEmail} placeholder="jane@example.com" type="email" />
                  <Field label="Property address *" value={address} onChange={setAddress} placeholder="123 Ocean Ave, Surfers Paradise QLD" />
                  {mode === "residential" && (
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}><Field label="Preferred date *" value={preferredDate} onChange={setPreferredDate} type="date" min={new Date().toISOString().split("T")[0]} /></div>
                      <div style={{ flex: 1 }}><Field label="Time" value={preferredTime} onChange={setPreferredTime} type="time" /></div>
                    </div>
                  )}
                </div>
              </Section>

              {mode === "airbnb" && (
                <Section n="2" label="Property access">
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <SelectField label="Access method" value={accessMethod} onChange={setAccessMethod} options={["Lockbox", "Key safe", "Smart lock", "Host present", "Other"]} />
                    <Field label="Access code / instructions" value={accessCode} onChange={setAccessCode} placeholder="e.g. Lockbox 5678, left of door" />
                    <SelectField label="Booking platform" value={platform} onChange={setPlatform} options={["Airbnb", "Stayz", "Booking.com", "Hostaway", "Direct", "Other"]} />
                    <SelectField label="Parking" value={parking} onChange={setParking} options={["Driveway", "Street parking", "Visitor bay", "No parking nearby"]} />
                    <Field label="Anything else? (optional)" value={notes} onChange={setNotes} placeholder="e.g. Guest checks out late" />
                  </div>
                </Section>
              )}

              <div style={{ textAlign: "center", fontSize: 11.5, color: MUTED, marginTop: 4 }}>
                No payment now. We confirm {mode === "residential" ? "your slot" : "your cleaner"} and text you to lock it in.
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Sticky action bar ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "rgba(8,12,18,0.94)", backdropFilter: "blur(10px)", borderTop: `1px solid ${BORDER}`, padding: "12px 16px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmt(priceIncGst)}</div>
          </div>
          {phase === "quote" ? (
            <button onClick={() => { setPhase("book"); window.scrollTo(0, 0); }}
              style={{ flex: 1, padding: "14px", borderRadius: 14, background: `linear-gradient(135deg, ${GREEN}, #22c55e)`, color: "#000", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 0 24px ${GREEN}44` }}>
              {mode === "residential" ? "Book this clean" : "Accept & continue"} <ArrowRight size={17} />
            </button>
          ) : (
            <div style={{ flex: 1, display: "flex", gap: 8 }}>
              <button onClick={() => { setPhase("quote"); }} style={{ padding: "14px 16px", borderRadius: 14, background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Back</button>
              <button onClick={submit} disabled={submitting}
                style={{ flex: 1, padding: "14px", borderRadius: 14, background: `linear-gradient(135deg, ${GREEN}, #22c55e)`, color: "#000", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: submitting ? 0.7 : 1 }}>
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {mode === "residential" ? "Request booking" : "Submit"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */
function Section({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, background: GREEN, color: "#000", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: MUTED }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: "100%", background: CARD, borderRadius: 14, padding: "13px 16px", border: `1px solid ${value ? GREEN : BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", textAlign: "left" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ width: 46, height: 27, borderRadius: 20, background: value ? GREEN : "rgba(255,255,255,0.12)", position: "relative", flexShrink: 0, transition: "background .15s" }}>
        <div style={{ position: "absolute", top: 3, left: value ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
      </div>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", min }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; min?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: MUTED, marginBottom: 5 }}>{label}</div>
      <input type={type} value={value} min={min} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 11, padding: "12px 14px", fontSize: 15, fontWeight: 500, color: TEXT, fontFamily: "inherit", background: CARD, outline: "none" }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: MUTED, marginBottom: 5 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <select value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 11, padding: "12px 14px", fontSize: 15, fontWeight: 600, color: TEXT, fontFamily: "inherit", background: CARD, appearance: "none", cursor: "pointer" }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={16} color={MUTED} style={{ position: "absolute", right: 12, top: 14, pointerEvents: "none" }} />
      </div>
    </div>
  );
}
