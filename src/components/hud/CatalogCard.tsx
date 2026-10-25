"use client";

import { motion } from "motion/react";
import ProductImage from "@/components/hud/ProductImage";
import { metaLine, type CatalogItem } from "@/lib/catalog";

export default function CatalogCard({ item, index, busy, onOpen }: { item: CatalogItem; index: number; busy: boolean; onOpen: () => void }) {
  return (
    <motion.button
      layout
      onClick={onOpen}
      disabled={busy}
      initial={index < 8 ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -3 }}
      transition={{ delay: Math.min(index, 8) * 0.025, type: "spring", stiffness: 300, damping: 30 }}
      aria-label={`Open ${item.name} manual`}
      className="ui-card group flex flex-col overflow-hidden text-left transition-[border-color,box-shadow] duration-200 hover:border-sky-300/40 hover:shadow-[0_20px_50px_-25px_rgba(73,189,245,0.45)] disabled:opacity-70"
    >
      <div className="relative m-2 mb-0 aspect-[4/3] overflow-hidden rounded-xl bg-white">
        <ProductImage src={item.source === "lego" ? (item.manuals[0]?.coverUrl ?? item.image) : item.image} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px" className="group-hover:scale-[1.05]" />
        <span className="absolute left-2 top-2 flex gap-1">
          {item.featured && <span className="rounded-md bg-sky-400 px-2 py-0.5 text-[10px] font-semibold text-ink">Featured</span>}
          <span className="rounded-md bg-[#081421]/85 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{item.category}</span>
        </span>
        {item.manuals.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-800 ring-1 ring-black/5">
            {item.manuals.length} books
          </span>
        )}
        {busy && <span className="scan-bar absolute inset-x-0 bottom-0 h-1" />}
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <h3 className="line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug tracking-tight sm:text-[15px]">{item.name}</h3>
        <p className="mt-1 text-[11px] text-white/55">{metaLine(item)}</p>
        <span className="mt-auto flex items-center justify-between border-t border-white/10 pt-3 text-xs font-semibold text-sky-200 transition group-hover:text-sky-100">
          {busy ? "Opening…" : "Open manual"}<span aria-hidden className="text-base leading-none transition-transform group-hover:translate-x-1">→</span>
        </span>
      </div>
    </motion.button>
  );
}
