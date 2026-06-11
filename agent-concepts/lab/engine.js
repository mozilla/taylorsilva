/* ============================================================================
   AGENT ENGINE — Smart Window Q3 agents (Watch + Research), functional sim
   Taylor Silva · Staff Product Designer, AI UX

   This is the surface-independent core. In-tree this would live at:
     browser/components/aiwindow/AgentEngine.sys.mjs   (proposed)
   with checks scheduled through nsIUpdateTimerManager and results routed
   through the notification service. Here the "LLM read" of a page is
   simulated with deterministic price paths + a tiny intent parser, so the
   prototype runs entirely offline and the demo always lands.

   Object model (the architecture being proposed):
     One user-level object → N surface projections.
     The engine knows nothing about surfaces; it emits events.

   Loaded as a classic script (shared global scope) so the lab runs from
   file:// as well as http; in-tree this is a proper ES module (.sys.mjs).
   ============================================================================ */

class AgentEngine extends EventTarget {
  constructor() {
    super();
    this.day = 0;
    this.watches = [];
    this.reports = [];
    this.activity = [];
    this._id = 1;
  }

  /* ── Intent parsing ──
     In production this is the model call; the contract is the output shape:
     { kind: "watch"|"research"|"chat", rule, title } — never free text. */
  parse(text, pageCtx) {
    const t = text.toLowerCase();
    const isResearch = /research|compare|help me (pick|choose|find)|what should i|don't know|which/.test(t);
    const isWatch = /watch|monitor|alert|tell me|notify|track|let me know|deal|promo|coupon|price/.test(t);

    if (isResearch && !/watch this/.test(t)) {
      return { kind: "research", query: text.trim() };
    }
    if (isWatch || /^\/watch/.test(t)) {
      // price target: last $N or bare number in a price-like position
      const m = [...t.matchAll(/\$\s?(\d+)/g)].pop() || [...t.matchAll(/\b(\d{2,4})\b/g)].pop();
      const target = m ? Number(m[1]) : null;
      const semantic = [];
      if (/refundable|flex/.test(t)) semantic.push("refundable");
      if (/weekday|mon|tue|wed|thu|fri/.test(t)) semantic.push("weekday departure");
      if (/promo|coupon|code|deal/.test(t)) semantic.push("verified promo found");
      return { kind: "watch", target, semantic, pageCtx };
    }
    return { kind: "chat", query: text.trim() };
  }

  /* ── Follow-up parsing ──
     Once a watch exists, most input about it is a follow-up, not a new
     task. Resolved against a context watch BEFORE generic parsing so
     "also watch Best Buy" doesn't spawn a duplicate. */
  followUp(text, w) {
    if (!w) return null;
    const t = text.toLowerCase();
    if (/\b(pause|stop|hold off|cancel|kill)\b/.test(t)) return { kind: "pause" };
    if (/\b(resume|unpause|restart|keep going|continue)\b/.test(t)) return { kind: "resume" };
    const m = t.match(/(?:to|at|target|cap(?: to| at)?|under)\s*\$?\s*(\d+)/);
    if (m && /\b(change|set|make|raise|lower|drop|update|bump|move)\b/.test(t)) return { kind: "retarget", target: +m[1] };
    if (/\b(add|also|include)\b/.test(t) && !/\bwatch this\b/.test(t)) {
      const nm = t.match(/(?:add|also watch|also|include)\s+([a-z0-9'& ]+?)(?:\s+(?:too|as well|please|to it))?\s*$/);
      return { kind: "add-retailer", name: nm ? nm[1].trim().replace(/\b\w/g, c => c.toUpperCase()) : "another retailer" };
    }
    if (/\b(status|progress|doing|going|any (luck|news|update|movement)|how.?s\b|update me|check in)\b|what did you find|find anything/.test(t)) return { kind: "status" };
    return null;
  }

  /* ── Follow-up actions ── */
  retarget(id, target) {
    const w = this.watches.find(w => w.id === id);
    if (!w) return null;
    w.target = target;
    this.log(`${w.title}: rule changed — alert at $${target}.`);
    if (w.status === "live" && w.price <= target) {
      w.status = "met";
      const judgment = `Already there — $${w.price.toFixed(2)} today, $${(target - w.price).toFixed(2)} under your new $${target} target.`;
      this.log(`Condition met immediately: ${w.title}`);
      this.emit("watch-hit", { watch: w, judgment });
    }
    this.emit("watch-updated", w);
    return w;
  }
  addRetailer(id, name) {
    const w = this.watches.find(w => w.id === id);
    if (!w) return null;
    w.retailers++;
    w.retailerNames = (w.retailerNames || [w.source]).concat(name);
    this.log(`${w.title}: added ${name} — now ${w.retailers} retailers as one group.`);
    this.emit("watch-updated", w);
    return w;
  }
  statusSummary(w) {
    if (w.status === "met") return `${w.title} already hit: $${w.price.toFixed(2)}${w.target ? `, your target was $${w.target}` : ""}.${w.promoFoundDay ? " Code SAVE10 still applies." : ""}`;
    if (w.status === "paused") return `${w.title} is paused — nothing has checked it since day ${this.day}. Say "resume" to pick it back up.`;
    const days = this.day - w.createdDay;
    const h = w.history;
    const trend = h.length > 1 ? (h[0] - h[h.length - 1]) / Math.max(days, 1) : 0;
    const toGo = w.target ? (w.price - w.target) : null;
    let s = `${w.title}: $${w.price.toFixed(2)} now`;
    if (toGo !== null) s += toGo > 0 ? ` — $${toGo.toFixed(2)} above your $${w.target} target` : ` — under target`;
    if (trend > 0.5) s += `. Trending down about $${trend.toFixed(0)}/day, so a hit looks ${toGo / trend <= 3 ? "close" : "possible this week"}`;
    else if (days > 0) s += `. Flat so far`;
    s += `. Checked ${w.lastChecked}, ${w.retailers > 1 ? w.retailers + " retailers grouped" : "1 source"}.${w.promoFoundDay ? " Found code SAVE10 (verified, not applied)." : ""}`;
    return s;
  }

  /* ── Watch lifecycle ── */
  createWatch({ title, source, kind, target, semantic = [], price, retailers = 1, path }) {
    const w = {
      id: this._id++,
      type: "watch",
      title, source, kind,          // kind: "price" | "fare"
      target, semantic, retailers,
      price, startPrice: price,
      history: [price],
      promoFoundDay: null,
      status: "live",               // live | met | paused
      createdDay: this.day,
      lastChecked: "just now",
      _path: path,                  // deterministic daily price path
    };
    this.watches.push(w);
    this.log(`Started watching ${w.title}` + (target ? ` — alert at $${target}` : ""));
    this.emit("watch-created", w);
    return w;
  }

  pauseWatch(id) {
    const w = this.watches.find(w => w.id === id);
    if (w && w.status === "live") { w.status = "paused"; this.log(`Paused: ${w.title}`); this.emit("watch-updated", w); }
  }
  resumeWatch(id) {
    const w = this.watches.find(w => w.id === id);
    if (w && w.status === "paused") { w.status = "live"; this.log(`Resumed: ${w.title}`); this.emit("watch-updated", w); }
  }
  pauseAll() {
    this.watches.filter(w => w.status === "live").forEach(w => { w.status = "paused"; });
    this.log("Paused all watches — nothing checks until you resume.");
    this.emit("watch-updated", null);
  }

  /* ── Research lifecycle ── */
  createReport(query) {
    const r = {
      id: this._id++,
      type: "report",
      title: this._reportTitle(query),
      query,
      createdDay: this.day,
      status: "working",            // working | done
      content: null,
      linkedChat: [
        { who: "user", text: query },
        { who: "ai", text: "On it — I'll compare current options across the web and write this up. A few minutes." },
      ],
    };
    this.reports.push(r);
    this.emit("report-started", r);
    // Simulated multi-step run (in production: model + page reads, plan shown first)
    const steps = ["Reading 14 pages…", "Comparing 6 options on 4 criteria…", "Checking price history…", "Writing the report…"];
    let i = 0;
    const tick = () => {
      if (i < steps.length) { this.emit("report-progress", { report: r, step: steps[i++] }); setTimeout(tick, 950); }
      else {
        r.status = "done";
        r.content = this._reportContent(r);
        this.log(`Report finished: ${r.title}`);
        this.emit("report-done", r);
      }
    };
    setTimeout(tick, 700);
    return r;
  }

  _reportTitle(q) {
    const t = q.toLowerCase();
    if (/headphone|anc|audio/.test(t)) return "ANC headphones under $100";
    if (/tokyo|japan|stay|hotel/.test(t)) return "Tokyo in March — where to stay";
    if (/desk/.test(t)) return "Standing desks compared";
    return q.length > 46 ? q.slice(0, 44) + "…" : q;
  }

  _reportContent(r) {
    return {
      meta: `6 options · 14 pages read · every source linked`,
      pick: { name: "Aurora ANC Wireless", why: "Best ANC per dollar · 42h battery · firmware fixed the hiss issue", price: "$89" },
      rows: [
        ["Aurora ANC", "Excellent", "42h", "$89", "Top pick"],
        ["Drift Q3", "Good", "60h", "$79", "Battery champ"],
        ["Pulse Air 2", "Excellent", "28h", "$99", "Best for calls"],
        ["Echo Lite", "Fair", "35h", "$59", "Budget option"],
      ],
      verdict: "The Aurora is the strongest buy but sits above your usual threshold — worth watching rather than buying today. If battery decides it, the Drift Q3 at $79 is the safe immediate pick.",
    };
  }

  /* ── Time ──
     Each advanceDay() is "the agents checked everything N times."
     Price paths are deterministic so the demo always lands within ~6 days. */
  advanceDay() {
    this.day++;
    for (const w of this.watches) {
      if (w.status !== "live") continue;
      const age = this.day - w.createdDay;
      w.price = w._path ? w._path(age, w) : Math.max(w.target ? w.target - 1 : w.price * 0.97, Math.round(w.price * (0.93 + Math.random() * 0.05)));
      w.history.push(w.price);
      w.lastChecked = "today";

      // promo discovery (scout behavior folded into watch)
      if (w.semantic.includes("verified promo found") && !w.promoFoundDay && age >= 2) {
        w.promoFoundDay = this.day;
        this.log(`${w.title}: found code SAVE10 — reported, not applied (read-only).`);
        this.emit("promo-found", w);
      }

      const hit =
        (w.target && w.price <= w.target) ||
        (w.kind === "fare" && age >= 4);   // semantic fare condition lands day 4

      if (hit) {
        w.status = "met";
        const judgment = w.kind === "fare"
          ? `$${w.price} refundable, Tuesday departure — $${w.target - w.price} under your cap. Fares at this level lasted ~2 days last month.`
          : `$${w.price.toFixed(2)} at ${w.source} — $${Math.abs(w.target - w.price).toFixed(2)} below your $${w.target} target${w.promoFoundDay ? ", and code SAVE10 still applies" : ""}.`;
        this.log(`Condition met: ${w.title}`);
        this.emit("watch-hit", { watch: w, judgment });
      } else {
        this.log(`${w.title}: checked — $${w.price}, kept watching.`);
      }
      this.emit("watch-updated", w);
    }
    this.emit("day", this.day);
  }

  log(text) {
    this.activity.unshift({ day: this.day, text });
    this.emit("activity", this.activity[0]);
  }

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
}

/* Deterministic price paths so every demo lands the same beats. */
const PATHS = {
  // $89 → drops past $75 on day 5
  aurora: (age) => [89, 86, 84, 82, 79, 74.5, 72][Math.min(age, 6)],
  // best fare $912 → semantic hit handled by kind:"fare" on day 4; price drifts
  fares: (age) => [912, 905, 889, 870, 834, 834, 841][Math.min(age, 6)],
};
