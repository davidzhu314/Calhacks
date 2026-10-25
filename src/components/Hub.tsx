"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookPicker from "@/components/hud/BookPicker";
import CatalogCard from "@/components/hud/CatalogCard";
import HudBackdrop from "@/components/hud/HudBackdrop";
import ManualCard from "@/components/hud/ManualCard";
import ProductImage from "@/components/hud/ProductImage";
import StatusBar from "@/components/hud/StatusBar";
import { categoriesOf, IKEA, LEGO, matches, toResult, type CatalogItem, type CatalogManual } from "@/lib/catalog";
import { addFromResult, addUpload, listManuals, removeManual, type Manual, type ManualResult } from "@/lib/manuals";

type Tab = "lego" | "ikea" | "mine";
const isSetNumber = (q: string) => /^\d{4,7}(-\d)?$/.test(q.trim());

export default function Hub() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("lego");
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<Manual[] | null>(null);
  const [picking, setPicking] = useState<CatalogItem | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live search for things not in the catalog (any LEGO set number, any IKEA product)
  const [live, setLive] = useState<{ q: string; results: ManualResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef(0);
  const dragDepth = useRef(0);

  useEffect(() => {
    listManuals().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  // Tracks whether the tab bar has scrolled up and pinned.
  const tabsSentinel = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = tabsSentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const items = useMemo(() => (tab === "lego" ? LEGO : tab === "ikea" ? IKEA : []), [tab]);
  const categories = useMemo(() => ["All", ...categoriesOf(items)], [items]);
  const shown = useMemo(
    () => items.filter((i) => (category === "All" || i.category === category) && (!query.trim() || matches(i, query))),
    [items, category, query],
  );
  const inProgress = library?.find((m) => m.page > 1 || (m.stepIdx ?? 0) > 0);
  const featured = LEGO.find((item) => item.featured) ?? LEGO[0];

  function switchTab(t: Tab) {
    searchRequest.current++;
    setSearching(false);
    setTab(t);
    setCategory("All");
    setQuery("");
    setError(null);
    setLive(null);
  }

  async function openResult(r: ManualResult, busyKey = r.pdfPath) {
    setOpening(busyKey);
    setError(null);
    try {
      const m = await addFromResult(r);
      // Start downloading the PDF now; the build screen picks up the same in-flight load.
      // (skipped for pre-read manuals, which don't need the PDF)
      Promise.all([import("@/lib/pdf"), import("@/lib/prebuilt")]).then(async ([{ openManualPdf }, { loadPrebuilt }]) => {
        if (!(await loadPrebuilt(m))) openManualPdf(m).catch(() => {});
      });
      router.push(`/build/${m.id}`);
    } catch (e) {
      setOpening(null);
      setError(e instanceof Error ? e.message : "Couldn't open this manual. Try again.");
    }
  }

  function openItem(item: CatalogItem) {
    if (item.manuals.length > 1) return setPicking(item);
    openManual(item, item.manuals[0]);
  }

  function openManual(item: CatalogItem, manual: CatalogManual) {
    setPicking(null);
    void openResult(toResult(item, manual), item.id);
  }

  const liveSearch = useCallback(async (q: string) => {
    const text = q.trim();
    if (text.length < 2) return;
    const request = ++searchRequest.current;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (request === searchRequest.current) setLive({ q: text, results: data.results });
    } catch (e) {
      if (request === searchRequest.current) setError(e instanceof Error && e.message ? e.message : "Search failed.");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("That isn't a PDF. Drop a PDF manual.");
      return;
    }
    setOpening("upload");
    setError(null);
    try {
      const m = await addUpload(file);
      router.push(`/build/${m.id}`);
    } catch (e) {
      setOpening(null);
      setError(e instanceof Error ? e.message : "Couldn't save that PDF. Try again.");
    }
  }

  async function remove(id: string) {
    await removeManual(id);
    setLibrary((l) => l?.filter((m) => m.id !== id) ?? null);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "lego", label: "LEGO", count: LEGO.length },
    { id: "ikea", label: "IKEA", count: IKEA.length },
    { id: "mine", label: "My projects", count: library?.length },
  ];

  function submitSearch() {
    const text = query.trim();
    if (text.length < 2 || tab === "mine") return;
    if (tab === "lego" && !isSetNumber(text)) {
      setError("To search beyond the LEGO catalog, enter a 4–7 digit set number.");
      return;
    }
    void liveSearch(text);
  }

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-clip"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void upload(e.dataTransfer.files?.[0]);
      }}
    >
      <HudBackdrop />
      <StatusBar />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-5 pb-24 sm:px-8">
        <section className="grid gap-8 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1.12fr)_minmax(330px,0.88fr)] lg:items-center lg:gap-12" aria-labelledby="hub-heading">
          <div className="min-w-0">
            <p className="ui-kicker mb-4 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_12px_#83d8ff]" /> Your build station</p>
            <motion.h1 id="hub-heading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="max-w-[14ch] text-[clamp(2.7rem,5vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-white">
              Instructions that <span className="text-sky-300">keep up.</span>
            </motion.h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ui-muted)] sm:text-lg">Choose a manual, point your camera at the build, and get the next step when you need it.</p>

            <form
              onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
              role="search"
              className="ui-card mt-7 flex w-full items-center gap-2 rounded-2xl p-1.5 pl-4 transition-colors focus-within:border-sky-300/60"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0 text-sky-200/65" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                value={query}
                onChange={(e) => { searchRequest.current++; setSearching(false); setQuery(e.target.value); setLive(null); setError(null); }}
                placeholder={tab === "ikea" ? "Product name, e.g. KALLAX" : tab === "lego" ? "Set name or number, e.g. 31136" : "Find a saved project"}
                aria-label="Search manuals"
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none sm:text-base"
              />
              {tab !== "mine" && <button type="submit" disabled={searching || query.trim().length < 2} className="ui-primary shrink-0 px-4 sm:px-5">{searching ? "Searching…" : "Find manual"}</button>}
            </form>
            <p className="mt-2 text-xs leading-relaxed text-white/45">Filters this library as you type. Search a LEGO set number or IKEA product to look beyond it.</p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button onClick={() => fileInput.current?.click()} className="ui-secondary">
                <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></svg>
                Upload a PDF
              </button>
              <span className="text-xs text-white/40">Your own picture-based instructions work too</span>
            </div>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Upload PDF manual" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="min-w-0">
            {inProgress ? (
              <div className="ui-card overflow-hidden p-5 sm:p-6">
                <p className="ui-kicker">Pick up where you left off</p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-white sm:h-36 sm:w-36">
                    {inProgress.pdfPath?.endsWith("/6455750.pdf") ? <Image src="/steps/6455750/65.jpg" alt="Exotic Parrot manual illustration" fill sizes="144px" className="object-cover object-[65%_center]" /> : inProgress.coverUrl ? <ProductImage src={inProgress.coverUrl} sizes="144px" /> : <span className="grid h-full place-items-center font-mono text-xs text-slate-600">PDF</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-white/50">{inProgress.subtitle}</p>
                    <h2 className="mt-1 line-clamp-2 text-xl font-semibold leading-tight sm:text-2xl">{inProgress.title}</h2>
                    <p className="mt-2 font-mono text-xs text-sky-200">Page {inProgress.page}{inProgress.pageCount ? ` / ${inProgress.pageCount}` : ""}</p>
                  </div>
                </div>
                <button onClick={() => router.push(`/build/${inProgress.id}`)} className="ui-primary mt-5 w-full">Continue building <span aria-hidden>→</span></button>
              </div>
            ) : featured && (
              <div className="ui-card relative overflow-hidden p-5 sm:p-6">
                <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3"><p className="ui-kicker">Ready to try</p><span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 font-mono text-[10px] text-sky-100">Featured manual</span></div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-white sm:h-40 sm:w-40">{featured.id === "lego-31136" ? <Image src="/steps/6455750/65.jpg" alt="Exotic Parrot manual illustration" fill sizes="160px" priority className="object-cover object-[65%_center]" /> : <ProductImage src={featured.image} sizes="160px" priority />}</div>
                  <div className="min-w-0"><p className="text-xs text-white/50">LEGO #{featured.set} · {featured.pieces} pieces</p><h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{featured.name}</h2><p className="mt-2 text-xs leading-relaxed text-white/55">Book 1 is ready to try with pre-read steps.</p></div>
                </div>
                <button onClick={() => openItem(featured)} disabled={!!opening} className="ui-primary mt-5 w-full">Start this build <span aria-hidden>→</span></button>
              </div>
            )}
          </motion.div>
        </section>

        {/* tabs: a frosted bar only once pinned to the top */}
        <div ref={tabsSentinel} aria-hidden className="mt-12 h-px sm:mt-16" />
        <nav
          aria-label="Manual library"
          className={`sticky top-0 z-20 -mx-5 px-5 pb-3 pt-3 transition-colors duration-300 sm:-mx-8 sm:px-8 ${
            pinned ? "border-b border-white/10 bg-[#07111c]/95 shadow-[0_12px_28px_-20px_#000] backdrop-blur-xl" : "bg-transparent"
          }`}
        >
          <div aria-label="Manual source" className="flex items-center gap-1 border-b border-white/10">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                aria-pressed={tab === t.id}
                className={`relative -mb-px flex min-h-11 items-center gap-2 px-3 py-2.5 text-sm font-medium transition ${tab === t.id ? "text-white" : "text-white/55 hover:text-white"}`}
              >
                {t.label}
                {t.count != null && t.count > 0 && <span className="rounded-full bg-white/[0.08] px-1.5 text-[11px] text-white/60">{t.count}</span>}
                {tab === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sky-300" />}
              </button>
            ))}
          </div>

          {tab !== "mine" && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${
                    category === c ? "border-sky-300/50 bg-sky-300/15 text-sky-50" : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </nav>

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</p>}

        {/* live search results (anything not in the catalog) */}
        <AnimatePresence>
          {(searching || live) && tab !== "mine" && (
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
              <h2 className="text-base font-semibold text-white/90">
                {searching ? `Searching ${tab === "lego" ? "LEGO" : "IKEA"}…` : `Search results for “${live!.q}”`}
              </h2>
              {searching && <div className="scan-bar mt-3 h-0.5 w-full rounded-full" />}
              {live && live.results.length === 0 && (
                <div className="ui-empty mt-3 px-5 py-7 text-sm text-white/60">No manuals found. Try a different {tab === "lego" ? "set number" : "product name"}.</div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live?.results.map((r, i) => (
                  <ManualCard
                    key={r.pdfPath}
                    index={i}
                    source={r.source}
                    title={r.title}
                    subtitle={r.subtitle}
                    coverUrl={r.coverUrl}
                    meta={r.sizeLabel}
                    action="Build"
                    busy={opening === r.pdfPath}
                    onAction={() => { void openResult(r); }}
                  />
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* catalog */}
        {tab !== "mine" && (
          <section className="mt-6" aria-label={`${tab === "lego" ? "LEGO" : "IKEA"} catalog`}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><p className="ui-kicker">Browse manuals</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{category === "All" ? (tab === "lego" ? "LEGO sets" : "IKEA furniture") : category}</h2></div>
              <p className="font-mono text-xs text-white/45">{shown.length} {shown.length === 1 ? "manual" : "manuals"}</p>
            </div>
            {shown.length === 0 && !live && (
              <div className="ui-empty px-5 py-9 text-center"><p className="text-base font-semibold">No matching manuals</p><p className="mt-1 text-sm text-white/55">Try a different term or category{tab === "lego" ? ", or search by set number" : ", or search IKEA by product name"}.</p><button onClick={() => { setQuery(""); setCategory("All"); }} className="ui-secondary mt-4">Clear filters</button></div>
            )}
            <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {shown.map((item, i) => (
                  <CatalogCard key={item.id} item={item} index={i} busy={opening === item.id} onOpen={() => openItem(item)} />
                ))}
              </AnimatePresence>
            </motion.div>
          </section>
        )}

        {/* my projects */}
        {tab === "mine" && (
          <section className="mt-6" aria-label="My projects">
            <div className="mb-4 flex items-end justify-between gap-4"><div><p className="ui-kicker">Your library</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">My projects</h2></div><p className="font-mono text-xs text-white/45">Saved on this device</p></div>
            {library === null ? <div role="status" className="ui-card h-40 animate-pulse p-6 text-sm text-white/50">Loading your projects…</div> : library.filter((m) => !query.trim() || `${m.title} ${m.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())).length === 0 ? (
              <div className="ui-empty px-5 py-10 text-center"><p className="text-lg font-semibold">{library.length ? "No matching projects" : "Your library is ready"}</p><p className="mt-1 text-sm text-white/55">{library.length ? "Try a different search." : "Open a manual or upload your own PDF to begin."}</p><button onClick={() => library.length ? setQuery("") : fileInput.current?.click()} className="ui-secondary mt-4">{library.length ? "Clear search" : "Upload a PDF"}</button></div>
            ) : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><AnimatePresence>
              {library.filter((m) => !query.trim() || `${m.title} ${m.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())).map((m, i) => (
                  <ManualCard
                    key={m.id}
                    index={i}
                    source={m.source}
                    title={m.title}
                    subtitle={m.subtitle}
                    coverUrl={m.coverUrl}
                    meta={m.pageCount ? `Page ${m.page} of ${m.pageCount}` : "Not started"}
                    progress={m.pageCount ? m.page / m.pageCount : 0}
                    action={m.page > 1 ? "Resume" : "Start"}
                    onAction={() => router.push(`/build/${m.id}`)}
                    onRemove={() => { void remove(m.id); }}
                  />
                ))}
            </AnimatePresence></div>}
          </section>
        )}
      </main>

      <AnimatePresence>{picking && <BookPicker item={picking} onPick={(m) => openManual(picking, m)} onClose={() => setPicking(null)} />}</AnimatePresence>

      {/* drag-and-drop overlay */}
      <AnimatePresence>
        {(dragging || opening === "upload") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/80 backdrop-blur-sm"
          >
            <div className="hud-panel holo-glow rounded-3xl border-dashed px-14 py-12 text-center">
              <p className="text-2xl font-semibold tracking-tight">{opening === "upload" ? "Opening manual…" : "Drop to add manual"}</p>
              <p className="mt-2 text-sm text-white/50">Any PDF build instructions</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
