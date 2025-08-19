import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GroupCombo({
  value,
  onChange,
  options = [],
  placeholder = "Group",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [created, setCreated] = useState([]);
  const [removedLC, setRemovedLC] = useState(() => new Set());
  const [editingOrigLC, setEditingOrigLC] = useState(null);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  const [overlayPos, setOverlayPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => { setQuery(value || ""); }, [value]);

  const createdLC = useMemo(() => new Set(created.map((g) => (g || "").toLowerCase())), [created]);
  const optionsLC = useMemo(() => new Set(options.map((g) => (g || "").toLowerCase())), [options]);

  const mergedOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const g of options) {
      const key = (g || "").trim().toLowerCase();
      if (!key || removedLC.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
    for (const g of created) {
      const key = (g || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(g);
    }
    return out;
  }, [options, created, removedLC]);

  const list = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return mergedOptions.slice(0, 8);
    return mergedOptions.filter((g) => g.toLowerCase().includes(q)).slice(0, 8);
  }, [mergedOptions, query]);

  const clampToViewport = (left, width, pad = 8) => {
    const vw = window.innerWidth || 360;
    const maxLeft = Math.max(pad, vw - width - pad);
    return Math.min(Math.max(left, pad), maxLeft);
  };

  const updateOverlay = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 240), Math.min(420, window.innerWidth - 16));
    const left = clampToViewport(r.left, width, 8);
    setOverlayPos({ top: r.bottom + 6, left, width });
  };

  useEffect(() => {
    if (!open) return;
    updateOverlay();
    const onScroll = () => updateOverlay();
    const onResize = () => updateOverlay();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e) => {
      const inRoot = rootRef.current?.contains(e.target);
      const inOverlay = overlayRef.current?.contains(e.target);
      if (!inRoot && !inOverlay) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function focusAndSelect() {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      updateOverlay();
    });
  }

  const pick = (g, { close = true } = {}) => {
    if (!g) return;
    onChange?.(g);
    setQuery(g);
    if (close) setOpen(false);
  };

  const createOrRenameFromQuery = () => {
    const raw = (query || "").trim();
    if (!raw) return;
    const lc = raw.toLowerCase();

    if (editingOrigLC) {
      const orig = editingOrigLC;
      if (optionsLC.has(orig)) {
        setRemovedLC((prev) => new Set(prev).add(orig));
      } else {
        setCreated((prev) => {
          const arr = prev.slice();
          const idx = arr.findIndex((g) => (g || "").toLowerCase() === orig);
          if (idx !== -1) arr.splice(idx, 1);
          return arr;
        });
      }
      setCreated((prev) => (prev.some((g) => (g || "").toLowerCase() === lc) || optionsLC.has(lc)) ? prev : [...prev, raw]);
      setEditingOrigLC(null);
      pick(raw, { close: false });
      setOpen(true);
      updateOverlay();
      return;
    }

    const already = mergedOptions.some((g) => (g || "").toLowerCase() === lc);
    if (!already) setCreated((prev) => [...prev, raw]);
    pick(raw, { close: false });
    setOpen(true);
    updateOverlay();
  };

  const startEdit = (g) => {
    const lc = (g || "").toLowerCase();
    setEditingOrigLC(lc);
    setQuery(g);
    setOpen(true);
    focusAndSelect();
  };

  const removeItem = (g) => {
    const lc = (g || "").toLowerCase();
    if (createdLC.has(lc)) {
      setCreated((prev) => prev.filter((x) => (x || "").toLowerCase() !== lc));
    } else if (optionsLC.has(lc)) {
      setRemovedLC((prev) => new Set(prev).add(lc));
    }
    if ((query || "").toLowerCase() === lc) {
      setQuery("");
      onChange?.("");
    }
    setEditingOrigLC((cur) => (cur === lc ? null : cur));
    setOpen(true);
    updateOverlay();
    focusAndSelect();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange?.(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => { setOpen(true); updateOverlay(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); createOrRenameFromQuery(); }
          else if (e.key === "Escape") { if (editingOrigLC) setEditingOrigLC(null); setOpen(false); }
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") { setOpen(true); }
        }}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-xl border border-input bg-background text-foreground text-base",
          "px-3 placeholder:text-muted-foreground",
          "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
          "transition-all duration-300"
        )}
      />

      {open && createPortal(
        <div
          ref={overlayRef}
          style={{ position: "fixed", top: overlayPos.top, left: overlayPos.left, width: overlayPos.width, zIndex: 9999 }}
          className="rounded-xl border bg-popover text-popover-foreground shadow-md border-border"
          role="listbox"
        >
          {list.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matches — press <span className="font-semibold">Enter</span> to add “{query}”.
            </div>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {list.map((g) => (
                <li key={g}>
                  <div className="flex items-center gap-2 px-3 py-2 min-h-[42px]">
                    <button
                      type="button"
                      onClick={() => pick(g)}
                      className="flex-1 text-left text-base hover:underline underline-offset-2"
                    >
                      {g}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Edit"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); startEdit(g); }}
                        className="p-1 rounded-md hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); removeItem(g); }}
                        className="p-1 rounded-md hover:bg-muted text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {query?.trim() &&
                !mergedOptions.some((o) => o.toLowerCase() === query.trim().toLowerCase()) && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => createOrRenameFromQuery()}
                      className="w-full text-left px-3 py-2 text-base hover:bg-muted font-medium"
                    >
                      Add “{query.trim()}”
                    </button>
                  </li>
                )}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}