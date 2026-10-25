"use client";

import * as Dialog from "@radix-ui/react-dialog";
import ProductImage from "@/components/hud/ProductImage";
import type { CatalogItem, CatalogManual } from "@/lib/catalog";

// Uses Radix Dialog's focus management, Escape handling and screen reader labels.
export default function BookPicker({ item, onPick, onClose }: { item: CatalogItem; onPick: (m: CatalogManual) => void; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#030912]/80 backdrop-blur-md data-[state=open]:animate-[fade-in_180ms_ease-out]" />
        <Dialog.Content className="ui-card fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_28px_90px_#000] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,620px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--ui-radius)] sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="ui-kicker">Choose an instruction book</p>
              <Dialog.Title className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{item.name}</Dialog.Title>
              <Dialog.Description className="mt-2 max-w-lg text-sm leading-relaxed text-white/60">
                {item.source === "lego" && item.category === "Creator"
                  ? "This set has different builds. Choose the book for the model you want to make."
                  : "This build has more than one instruction book. Choose where to start or continue."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><button aria-label="Close book picker" className="ui-secondary h-11 w-11 shrink-0 !p-0 text-lg" type="button">×</button></Dialog.Close>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {item.manuals.map((m) => (
              <button key={m.pdfPath} onClick={() => onPick(m)} className="ui-card group overflow-hidden rounded-xl text-left transition hover:border-sky-300/55 hover:bg-sky-300/5">
                <div className="relative aspect-square bg-white"><ProductImage src={m.coverUrl ?? item.image} sizes="(max-width: 640px) 44vw, 180px" padded={false} className="group-hover:scale-[1.04]" /></div>
                <div className="flex items-center justify-between gap-2 p-3"><span className="text-xs font-semibold leading-snug">{m.label}</span><span aria-hidden className="text-sky-200 transition-transform group-hover:translate-x-1">→</span></div>
                {m.size && <p className="px-3 pb-3 font-mono text-[10px] text-white/45">{m.size}</p>}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
