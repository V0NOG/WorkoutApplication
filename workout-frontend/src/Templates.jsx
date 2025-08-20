// src/Templates.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import DatePicker from "./DatePicker.jsx";
import { pingTemplatesChanged } from "./bus";
import GroupCombo from "./components/GroupCombo.jsx";
import { useToast } from "./App.jsx";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const inputClass =
  "h-11 rounded-xl border border-input bg-background text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring " +
  "transition-all duration-300";

function DayPills({ value, onToggle }) {
  return (
    <div className="grid grid-cols-7 gap-2 w-full">
      {DOW.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onToggle(i)}
            className={[
              "w-full px-2 py-1 rounded-full text-sm",
              "transition-colors",
              on
                ? "bg-blue-500 text-white border border-transparent"
                : "bg-transparent border border-border hover:bg-white/5"
            ].join(" ")}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div
      className={[
        "inline-flex h-10 items-center rounded-lg border border-input bg-muted px-1",
        "max-w-full",
        className
      ].join(" ")}
    >
      {options.map(({ value: v, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition",
              "whitespace-nowrap",
              active
                ? "bg-background text-foreground shadow-sm border border-input"
                : "text-muted-foreground"
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Small label that matches the “Weight pattern” header
function SmallLabel({ children }) {
  return <div className="small text-muted-foreground h-5">{children}</div>;
}

// Numeric-only input (digits + optional single decimal point)
function NumericInput({ value, onChange, className = "", ...rest }) {
  const handleKeyDown = (e) => {
    const k = e.key;
    if (k === "e" || k === "E" || k === "+" || k === "-") { e.preventDefault(); return; }
    if (["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End","Enter"].includes(k)) return;
    if (k === ".") { if (String(value || "").includes(".")) e.preventDefault(); return; }
    if (!/^\d$/.test(k)) e.preventDefault();
  };
  const handleChange = (e) => {
    let s = e.target.value.replace(/[^\d.]/g, "");
    const parts = s.split(".");
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    onChange?.({ target: { value: s } });
  };
  return (
    <Input
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.]?[0-9]*"
      className={className}
      value={value}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      {...rest}
    />
  );
}

function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10); // YYYY-MM-DD
}

/* ---------------- Weight-pattern helpers & summary ---------------- */

// Auto step from sets/start/end; snapped to nearest 0.5 kg
function autoStepFor(sets, start, end) {
  const S = Math.max(2, Number(sets) || 0); // at least 2 sets to have a step
  const a = Number(start), b = Number(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const raw = Math.abs(b - a) / (S - 1);
  const snapped = Math.round(raw * 2) / 2; // nearest 0.5
  return snapped > 0 ? String(snapped) : "";
}

// summary string for list rows
function summarizeWeightPattern(t) {
  const wp = t.weightPattern || {};
  const sets = Number(t.dailyTarget || 0) || 0;
  const start = Number(wp.start ?? t.weight);
  const end   = Number(wp.end   ?? t.weight);
  const stepStr = wp.step != null && wp.step !== ""
    ? String(wp.step)
    : autoStepFor(sets, start, end);

  switch (wp.mode) {
    case "fixed":
      return Number.isFinite(start) ? `${start} kg` : (t.weight != null ? `${t.weight} kg` : "");
    case "drop":
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return `Drop ${start}→${end} kg${stepStr ? ` (−${stepStr} kg)` : ""}`;
      }
      return "";
    case "ramp":
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return `Ramp ${start}→${end} kg${stepStr ? ` (+${stepStr} kg)` : ""}`;
      }
      return "";
    case "custom":
      return Array.isArray(wp.perSet) && wp.perSet.length ? `Sets ${wp.perSet.join(" / ")} kg` : "";
    default:
      return t.weight != null ? `${t.weight} kg` : "";
  }
}

export default function Templates() {
  const [list, setList] = useState([]);
  const { push: toast } = useToast();

  const defaultForm = () => ({
    name: "",
    kind: "calisthenics",
    group: "",
    unit: "reps",
    dailyTarget: 200,        // Cali: daily target | Gym: # sets
    defaultSetSize: 20,      // Cali: set size      | Gym: # reps
    weight: "",              // legacy, only used for Fixed UX
    daysOfWeek: [1,2,3,4,5],
    startDate: todayLocalISO(),
    endDate: "",
    progMode: "volume",      // "volume" | "weight" (gym)
    weeklyPct: 0,
    cap: "",
    deloadEvery: 0,
    deloadScale: 0.7,
    showProg: false,
    showDeload: false,
    // UI state for weight pattern. _stepManual is UI-only; not sent to API.
    weightPattern: { mode: "fixed", start: "", end: "", step: "", perSet: "", _stepManual: false },
  });

  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const listRef = useRef(null);

  function upd(k, v)  { setForm((p) => ({ ...p, [k]: v })); }
  function dset(k, v) { setDraft((p) => ({ ...p, [k]: v })); }

  async function refresh() {
    const data = await api.listTemplates();
    setList(data);
  }
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!form.startDate) upd("startDate", todayLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Auto-step: only when NOT manually overridden ---------------- */

  // EDIT (draft)
  useEffect(() => {
    if (!draft || draft.kind !== "gym") return;
    const mode = draft.weightPattern?.mode || "fixed";
    if (mode !== "drop" && mode !== "ramp") return;
    if (draft.weightPattern?._stepManual) return; // user is controlling it
    const start = draft.weightPattern?.start ?? draft.weight;
    const end   = draft.weightPattern?.end   ?? draft.weight;
    const next  = autoStepFor(draft.dailyTarget, start, end);
    const cur   = String(draft.weightPattern?.step ?? "");
    if (next !== cur) {
      setDraft(p => ({ ...p, weightPattern: { ...(p.weightPattern || {}), step: next } }));
    }
  }, [draft?.kind, draft?.dailyTarget, draft?.weightPattern?.mode, draft?.weightPattern?.start, draft?.weightPattern?.end, draft?.weight, draft?.weightPattern?._stepManual]);

  // CREATE (form)
  useEffect(() => {
    if (form.kind !== "gym") return;
    const mode = form.weightPattern?.mode || "fixed";
    if (mode !== "drop" && mode !== "ramp") return;
    if (form.weightPattern?._stepManual) return;
    const start = form.weightPattern?.start ?? form.weight;
    const end   = form.weightPattern?.end   ?? form.weight;
    const next  = autoStepFor(form.dailyTarget, start, end);
    const cur   = String(form.weightPattern?.step ?? "");
    if (next !== cur) {
      setForm(p => ({ ...p, weightPattern: { ...(p.weightPattern || {}), step: next } }));
    }
  }, [form.kind, form.dailyTarget, form.weightPattern?.mode, form.weightPattern?.start, form.weightPattern?.end, form.weight, form.weightPattern?._stepManual]);

  const groupOptions = useMemo(() => {
    const s = new Set(list.map(t => (t.group || "").trim()).filter(Boolean));
    return Array.from(s).sort((a,b) => a.localeCompare(b));
  }, [list]);

  async function create() {
    try {
      const weeklyPct   = form.showProg    ? (Number(form.weeklyPct) || 0) : 0;
      const capVal      = form.showProg    ? (form.cap ? Number(form.cap) : null) : null;
      const deloadEvery = form.showDeload  ? (Number(form.deloadEvery) || 0) : 0;
      const deloadScale = form.showDeload  ? (Number(form.deloadScale) || 0.7) : 0.7;
      const toNum = v => (v === "" || v == null) ? null : Number(v);

      const wp = form.kind === "gym"
        ? (() => {
            const mode = form.weightPattern?.mode || 'fixed';
            const perSetArr = String(form.weightPattern?.perSet || "")
              .split(",").map(s=>s.trim()).filter(Boolean).map(Number);
            const start = mode === "fixed"
              ? toNum(form.weight || form.weightPattern?.start)
              : toNum(form.weightPattern?.start);
            const end = mode === "fixed" ? start : toNum(form.weightPattern?.end);
            return { mode, start, end, step: toNum(form.weightPattern?.step), perSet: perSetArr };
          })()
        : undefined;

      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        group: (form.group || "").trim(),
        unit: form.unit,
        dailyTarget: Number(form.dailyTarget),
        defaultSetSize: Number(form.defaultSetSize),
        ...(form.kind === "gym" && {
          weight: form.weight === "" ? null : Number(form.weight), // legacy fixed UX
          weightPattern: wp
        }),
        schedule: {
          type: "weekly",
          daysOfWeek: form.daysOfWeek,
          startDate: form.startDate || new Date().toISOString().slice(0,10),
          endDate: form.endDate || null,
        },
        progression: { mode: form.progMode, weeklyPct, cap: capVal },
        deloadRule: { mode: form.progMode, everyNWeeks: deloadEvery, scale: deloadScale },
      };

      if (!payload.name) throw new Error("Please enter a name for the template.");

      await api.createTemplate(payload);
      pingTemplatesChanged();
      await refresh();
      setForm(defaultForm());

      toast({
        title: "Template created",
        description: `“${payload.name}” was added${payload.group ? ` to ${payload.group}` : ""}.`,
        variant: "success"
      });

      requestAnimationFrame(() => {
        listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      toast({
        title: "Could not create template",
        description: e?.message || "Please check your inputs and try again.",
        variant: "error"
      });
    }
  }

  function askDelete(id) { setConfirmDeleteId(id); }
  async function doDelete(id) {
    setDeleting(true);
    try {
      await api.deleteTemplate(id);
      pingTemplatesChanged();
      await refresh();
      toast({ title: "Template deleted", variant: "success" });
    } catch (e) {
      toast({ title: "Delete failed", description: e?.message || "Please try again.", variant: "error" });
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  function startEdit(t) {
    const hasProg = (t.progression?.weeklyPct ?? 0) > 0 || (t.progression?.cap ?? null) != null;
    const hasDeload = (t.deloadRule?.everyNWeeks ?? 0) > 0;

    setEditingId(t._id);
    setDraft({
      _id: t._id,
      name: t.name ?? "",
      kind: t.kind ?? "calisthenics",
      group: t.group ?? "",
      unit: t.unit ?? "reps",
      dailyTarget: t.dailyTarget ?? 0,
      defaultSetSize: t.defaultSetSize ?? 10,
      weight: t.weight ?? "",
      daysOfWeek: t.schedule?.daysOfWeek?.slice() ?? [1,2,3,4,5],
      startDate: t.schedule?.startDate ?? "",
      endDate: t.schedule?.endDate ?? "",
      progMode: t.progression?.mode || t.deloadRule?.mode || "volume",
      weeklyPct: t.progression?.weeklyPct ?? 0,
      cap: (t.progression?.cap ?? "") === null ? "" : (t.progression?.cap ?? ""),
      deloadEvery: t.deloadRule?.everyNWeeks ?? 0,
      deloadScale: t.deloadRule?.scale ?? 0.7,
      showProg: hasProg,
      showDeload: hasDeload,
      // include UI-only _stepManual flag default false
      weightPattern: {
        mode: t.weightPattern?.mode || 'fixed',
        start: t.weightPattern?.start ?? (t.weight ?? ""),
        end:   t.weightPattern?.end   ?? (t.weight ?? ""),
        step:  t.weightPattern?.step  ?? "",
        perSet: Array.isArray(t.weightPattern?.perSet) ? t.weightPattern.perSet.join(", ") : "",
        _stepManual: false,
      },
    });
  }
  function cancelEdit() { setEditingId(null); setDraft(null); setConfirmDeleteId(null); }

  async function saveEdit() {
    if (!editingId || !draft) return;
    try {
      const weeklyPct = draft.showProg ? (Number(draft.weeklyPct) || 0) : 0;
      const capVal = draft.showProg ? (draft.cap === "" ? null : Number(draft.cap)) : null;
      const deloadEvery = draft.showDeload ? (Number(draft.deloadEvery) || 0) : 0;
      const deloadScale = draft.showDeload ? (Number(draft.deloadScale) || 0.7) : 0.7;
      const toNum = v => (v === "" || v == null) ? null : Number(v);

      const wp = draft.kind === "gym" ? (() => {
        const mode = draft.weightPattern?.mode || "fixed";
        const perSetArr = String(draft.weightPattern?.perSet || "")
          .split(",").map(s=>s.trim()).filter(Boolean).map(Number);
        const start = mode === "fixed"
          ? toNum(draft.weight || draft.weightPattern?.start)
          : toNum(draft.weightPattern?.start);
        const end = mode === "fixed" ? start : toNum(draft.weightPattern?.end);
        return { mode, start, end, step: toNum(draft.weightPattern?.step), perSet: perSetArr };
      })() : undefined;

      const payload = {
        name: draft.name.trim(),
        kind: draft.kind,
        group: (draft.group || "").trim(),
        unit: draft.unit,
        dailyTarget: Number(draft.dailyTarget),
        defaultSetSize: Number(draft.defaultSetSize),
        ...(draft.kind === "gym" && {
          weight: draft.weight === "" ? null : Number(draft.weight), // legacy fixed UX
          weightPattern: wp,
        }),
        schedule: {
          type: "weekly",
          daysOfWeek: draft.daysOfWeek,
          startDate: draft.startDate || new Date().toISOString().slice(0,10),
          endDate: draft.endDate || null,
        },
        progression: { mode: draft.progMode, weeklyPct, cap: capVal },
        deloadRule: { mode: draft.progMode, everyNWeeks: deloadEvery, scale: deloadScale },
      };

      if (!payload.name) throw new Error("Please enter a name for the template.");

      await api.updateTemplate(editingId, payload);
      pingTemplatesChanged();
      cancelEdit();
      await refresh();
      toast({ title: "Changes saved", description: `Updated “${payload.name}”.`, variant: "success" });
    } catch (e) {
      toast({ title: "Save failed", description: e?.message || "Please try again.", variant: "error" });
    }
  }

  const sorted = [...list].sort(
    (a, b) => (a.group || "").localeCompare(b.group || "") || a.name.localeCompare(b.name)
  );
  const groupedMap = sorted.reduce((acc, t) => {
    const key = (t.group || "Ungrouped").trim() || "Ungrouped";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});
  const isGym = form.kind === "gym";

  return (
    <div className="stack">
      {/* ===== Templates List FIRST so new items are immediately visible ===== */}
      <div ref={listRef} className="card p-0 mt-3">
        {sorted.length === 0 ? (
          <div className="p-6 small text-muted-foreground">No templates yet.</div>
        ) : (
          Object.entries(groupedMap).map(([groupName, items], gi) => (
            <div key={groupName} className={gi > 0 ? "border-t border-border/60 pt-3" : "pt-3"}>
              <div className="px-4 pb-2">
                <div className="inline-flex items-center rounded-lg bg-muted/60 px-3 py-1.5 text-sm font-semibold">
                  {groupName}
                </div>
              </div>

              <div className="mx-3 mb-4 overflow-hidden rounded-xl bg-secondary/40">
                <div className="divide-y divide-border">
                  {items.map((t) => {
                    const editing = editingId === t._id;

                    if (!editing) {
                      const gym = t.kind === "gym";
                      const hasProg = (t.progression?.weeklyPct ?? 0) > 0 || (t.progression?.cap ?? null) != null;
                      const hasDeload = (t.deloadRule?.everyNWeeks ?? 0) > 0;
                      const totalReps = gym ? Number(t.dailyTarget || 0) * Number(t.defaultSetSize || 0) : null;

                      const wpSummary = gym ? summarizeWeightPattern(t) : "";

                      return (
                        <div key={t._id} className="p-4 md:p-5 flex items-start gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="font-medium">{t.name}</div>
                            <div className="small text-muted-foreground">
                              {gym ? (
                                <>
                                  <span className="uppercase">GYM</span>{" • "}
                                  {t.dailyTarget} sets • {t.defaultSetSize} reps
                                  {totalReps > 0 ? <> {" "}→ <strong>{totalReps} total</strong></> : null}
                                  {wpSummary ? ` • ${wpSummary}` : ""}
                                  {" • Days: "}{t.schedule?.daysOfWeek?.map((i)=>DOW[i]).join(", ")}
                                  {" • Prog: "}{hasProg ? (t.progression?.mode || "volume") : "off"}
                                  {" • Deload: "}{hasDeload ? `${t.deloadRule?.everyNWeeks}w @ ${Math.round((t.deloadRule?.scale ?? 0.7)*100)}%` : "off"}
                                </>
                              ) : (
                                <>
                                  <span className="uppercase">CALISTHENICS</span>{" • "}
                                  {t.dailyTarget}/{t.unit} • set {t.defaultSetSize}
                                  {" • Days: "}{t.schedule?.daysOfWeek?.map((i)=>DOW[i]).join(", ")}
                                  {" • Prog: "}{hasProg ? (t.progression?.mode || "volume") : "off"}
                                  {" • Deload: "}{hasDeload ? `${t.deloadRule?.everyNWeeks}w @ ${Math.round((t.deloadRule?.scale ?? 0.7)*100)}%` : "off"}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions / Inline delete confirmation */}
                          <div className="flex items-center gap-2">
                            {confirmDeleteId !== t._id ? (
                              <>
                                <Button variant="outline" onClick={() => startEdit(t)}>Edit</Button>
                                <Button
                                  variant="outline"
                                  onClick={() => askDelete(t._id)}
                                  aria-label={`Delete ${t.name}`}
                                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-500/10"
                                >
                                  Delete
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center gap-2 rounded-xl border px-3 py-2 border-red-300 bg-red-50 dark:border-red-400/40 dark:bg-red-500/10">
                                <span className="small text-red-700 dark:text-red-300">
                                  Delete “{t.name}”?
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => doDelete(t._id)}
                                  disabled={deleting}
                                  className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-400/40 dark:text-red-200 dark:hover:bg-red-500/20"
                                >
                                  {deleting ? "Deleting…" : "Delete"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deleting}
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const gym = draft.kind === "gym";
                    return (
                      <div key={t._id} className="p-4 md:p-5 space-y-5">
                        <div className="grid grid-cols-12 gap-4 items-end">
                          <div className="col-span-12 sm:col-span-4">
                            <SmallLabel>Type</SmallLabel>
                            <Segmented
                              className="text-base"
                              value={draft.kind}
                              onChange={(k) => {
                                if (k === "gym") {
                                  dset("kind", "gym");
                                  dset("dailyTarget", 5);
                                  dset("weightPattern", { mode: "fixed", start: draft.weight || "", end: draft.weight || "", step: "", perSet: "", _stepManual:false });
                                } else {
                                  dset("kind", "calisthenics");
                                  dset("dailyTarget", 200);
                                }
                              }}
                              options={[
                                { value: "calisthenics", label: "Calisthenics" },
                                { value: "gym", label: "Gym" },
                              ]}
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-8">
                            <SmallLabel>Group (type to create or pick)</SmallLabel>
                            <GroupCombo
                              options={groupOptions}
                              value={draft.group}
                              onChange={(v)=>dset("group", v)}
                              placeholder="Back Day, Push Day, Core…"
                            />
                          </div>
                        </div>

                        <div>
                          <SmallLabel>Name</SmallLabel>
                          <Input className={inputClass} value={draft.name} onChange={(e)=>dset("name", e.target.value)} />
                        </div>

                        {/* Targets */}
                        <div className="grid grid-cols-12 gap-4 items-end">
                          <div className={["col-span-12", "md:col-span-6", "transition-all duration-300"].join(" ")}>
                            <SmallLabel>{gym ? "Number of sets (per day)" : "Daily target"}</SmallLabel>
                            <NumericInput className={inputClass} value={draft.dailyTarget} onChange={(e)=>dset("dailyTarget", e.target.value)} />
                          </div>
                          <div className={["col-span-12", "md:col-span-6", "transition-all duration-300"].join(" ")}>
                            <SmallLabel>{gym ? "Number of reps (per set)" : "Preferred set size"}</SmallLabel>
                            <NumericInput className={inputClass} value={draft.defaultSetSize} onChange={(e)=>dset("defaultSetSize", e.target.value)} />
                          </div>
                        </div>

                        {gym && (
                          <div className="rounded-xl border border-border p-3 mt-2 space-y-3">
                            <SmallLabel>Weight pattern</SmallLabel>

                            <div className="flex flex-wrap items-center gap-2">
                              <Segmented
                                value={draft.weightPattern?.mode || "fixed"}
                                onChange={(mode) => {
                                  if (mode !== "fixed") dset("weight", "");
                                  dset("weightPattern", { ...(draft.weightPattern || {}), mode, _stepManual:false });
                                }}
                                options={[
                                  { value: "fixed", label: "Fixed" },
                                  { value: "drop",  label: "Drop"  },
                                  { value: "ramp",  label: "Ramp"  },
                                  { value: "custom",label: "Custom"},
                                ]}
                              />
                              <div className="small text-muted-foreground">
                                Fixed = same weight per set; Drop = high→low; Ramp = low→high; Custom = list per set.
                              </div>
                            </div>

                            {/* FIXED */}
                            {(draft.weightPattern?.mode || "fixed") === "fixed" && (
                              <div>
                                <SmallLabel>Target weight (kg)</SmallLabel>
                                <NumericInput
                                  className={inputClass}
                                  placeholder="e.g., 40"
                                  value={draft.weight}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    dset("weight", v);
                                    dset("weightPattern", { ...(draft.weightPattern || {}), start: v, end: v, step: "", perSet: "", _stepManual:false });
                                  }}
                                />
                              </div>
                            )}

                            {/* DROP / RAMP */}
                            {["drop","ramp"].includes(draft.weightPattern?.mode || "") && (
                              <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-12 sm:col-span-4">
                                  <SmallLabel>Start (kg)</SmallLabel>
                                  <NumericInput
                                    className={inputClass}
                                    value={draft.weightPattern?.start ?? ""}
                                    onChange={(e)=>dset("weightPattern", { ...(draft.weightPattern||{}), start: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-12 sm:col-span-4">
                                  <SmallLabel>End (kg)</SmallLabel>
                                  <NumericInput
                                    className={inputClass}
                                    value={draft.weightPattern?.end ?? ""}
                                    onChange={(e)=>dset("weightPattern", { ...(draft.weightPattern||{}), end: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-12 sm:col-span-4">
                                  <SmallLabel>Step (kg)</SmallLabel>
                                  <div className="flex items-center gap-2">
                                    <NumericInput
                                      className={inputClass + " flex-1"}
                                      value={draft.weightPattern?.step ?? ""}
                                      onChange={(e)=>{
                                        const v = e.target.value;
                                        const manual = v !== "";
                                        dset("weightPattern", { ...(draft.weightPattern||{}), step: v, _stepManual: manual });
                                      }}
                                    />
                                    {/* <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={()=>{
                                        const start = draft.weightPattern?.start ?? draft.weight;
                                        const end = draft.weightPattern?.end ?? draft.weight;
                                        const next = autoStepFor(draft.dailyTarget, start, end);
                                        dset("weightPattern", { ...(draft.weightPattern||{}), step: next, _stepManual: false });
                                      }}
                                    >
                                      Auto
                                    </Button> */}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* CUSTOM */}
                            {(draft.weightPattern?.mode || "") === "custom" && (
                              <div>
                                <SmallLabel>Per set (comma separated)</SmallLabel>
                                <Input
                                  className={inputClass}
                                  inputMode="numeric"
                                  pattern="[0-9,.\s]*"
                                  placeholder="e.g., 60, 55, 50, 45"
                                  value={draft.weightPattern?.perSet ?? ""}
                                  onChange={(e)=>{
                                    const v = e.target.value.replace(/[^0-9,.\s]/g, "");
                                    dset("weightPattern", { ...(draft.weightPattern || {}), perSet: v });
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Schedule row (edit) */}
                        <div>
                          <SmallLabel>Schedule</SmallLabel>
                          <div className="grid grid-cols-12 gap-4 items-end mt-1.5">
                            <div className="col-span-12 md:col-span-6 min-w-0">
                              <DayPills
                                value={draft.daysOfWeek}
                                onToggle={(i)=>{
                                  const on = draft.daysOfWeek.includes(i);
                                  dset("daysOfWeek", on ? draft.daysOfWeek.filter(x=>x!==i) : [...draft.daysOfWeek, i].sort());
                                }}
                              />
                            </div>

                            {gym && (
                              <div className="col-span-12 md:col-span-2 min-w-0">
                                <SmallLabel>Basis</SmallLabel>
                                <Segmented
                                  value={draft.progMode}
                                  onChange={(m)=>dset("progMode", m)}
                                  options={[
                                    { value: "volume", label: "Reps" },
                                    { value: "weight", label: "Weight" },
                                  ]}
                                />
                              </div>
                            )}

                            <div className={["col-span-6", gym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
                              <SmallLabel>Progression</SmallLabel>
                              <Segmented
                                value={draft.showProg ? "on" : "off"}
                                onChange={(v)=>dset("showProg", v === "on")}
                                options={[
                                  { value: "off", label: "Hide" },
                                  { value: "on", label: "Show" },
                                ]}
                              />
                            </div>

                            <div className={["col-span-6", gym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
                              <SmallLabel>Deload</SmallLabel>
                              <Segmented
                                value={draft.showDeload ? "on" : "off"}
                                onChange={(v)=>dset("showDeload", v === "on")}
                                options={[
                                  { value: "off", label: "Hide" },
                                  { value: "on", label: "Show" },
                                ]}
                              />
                            </div>
                          </div>
                        </div>

                        {draft.showProg && (
                          <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-12 md:col-span-6">
                              <SmallLabel>Progression weekly %</SmallLabel>
                              <NumericInput className={inputClass} value={draft.weeklyPct} onChange={(e)=>dset("weeklyPct", e.target.value)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <SmallLabel>Progression cap</SmallLabel>
                              <NumericInput className={inputClass} placeholder="e.g., 300" value={draft.cap} onChange={(e)=>dset("cap", e.target.value)} />
                            </div>
                          </div>
                        )}

                        {draft.showDeload && (
                          <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-12 md:col-span-6">
                              <SmallLabel>Deload every N weeks</SmallLabel>
                              <NumericInput className={inputClass} value={draft.deloadEvery} onChange={(e)=>dset("deloadEvery", e.target.value)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <SmallLabel>Deload scale</SmallLabel>
                              <NumericInput className={inputClass} value={draft.deloadScale} onChange={(e)=>dset("deloadScale", e.target.value)} />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                          <Button onClick={saveEdit}>Save</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ===== New Template Form (below the list) ===== */}
      <div className="card p-6 mt-4">
        {/* Header: Kind + Group */}
        <div className="grid grid-cols-12 gap-4 items-end">
          <div className="col-span-12 md:col-span-3">
            <div className="small text-muted-foreground h-5 select-none opacity-0">.</div>
            <div className="h-11 flex items-center text-xl font-semibold">
              New Template
            </div>
          </div>

          <div className="col-span-12 sm:col-span-4 md:col-span-3">
            <SmallLabel>Type</SmallLabel>
            <Segmented
              className="text-base"
              value={form.kind}
              onChange={(k) => {
                if (k === "gym") {
                  setForm(p => ({ ...p, kind: "gym", dailyTarget: 5, weightPattern: { mode: "fixed", start: p.weight || "", end: p.weight || "", step: "", perSet: "", _stepManual:false } }));
                } else {
                  setForm((p) => ({ ...p, kind: "calisthenics", dailyTarget: 200 }));
                }
              }}
              options={[
                { value: "calisthenics", label: "Calisthenics" },
                { value: "gym", label: "Gym" },
              ]}
            />
          </div>

          <div className="col-span-12 sm:col-span-5 md:col-span-6">
            <SmallLabel>Group (type to create or pick)</SmallLabel>
            <GroupCombo
              options={groupOptions}
              value={form.group}
              onChange={(v) => upd("group", v)}
              placeholder="Back Day, Push Day, Core…"
              className="w-full"
            />
          </div>
        </div>

        {/* Create form body */}
        <div className="space-y-6 mt-6">
          <div>
            <SmallLabel>Name (e.g., Pull-ups / Bench Press)</SmallLabel>
            <Input className={inputClass} value={form.name} onChange={(e)=>upd("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-12 gap-4 items-end">
            <div className={["col-span-12", "md:col-span-6", "transition-all duration-300"].join(" ")}>
              <SmallLabel>{isGym ? "Number of sets" : "Daily target"}</SmallLabel>
              <NumericInput className={inputClass} value={form.dailyTarget} onChange={(e)=>upd("dailyTarget", e.target.value)} />
            </div>

            <div className={["col-span-12", "md:col-span-6", "transition-all duration-300"].join(" ")}>
              <SmallLabel>{isGym ? "Number of reps (per set)" : "Preferred rep size"}</SmallLabel>
              <NumericInput className={inputClass} value={form.defaultSetSize} onChange={(e)=>upd("defaultSetSize", e.target.value)} />
            </div>
          </div>

          {isGym && (
            <div className="rounded-xl border border-border p-3 mt-2 space-y-3">
              <SmallLabel>Weight pattern</SmallLabel>

              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={form.weightPattern?.mode || "fixed"}
                  onChange={(mode) => {
                    if (mode !== "fixed") upd("weight", "");
                    upd("weightPattern", { ...(form.weightPattern || {}), mode, _stepManual:false });
                  }}
                  options={[
                    { value: "fixed", label: "Fixed" },
                    { value: "drop",  label: "Drop"  },
                    { value: "ramp",  label: "Ramp"  },
                    { value: "custom",label: "Custom"},
                  ]}
                />
                <div className="small text-muted-foreground">
                  Fixed = same weight per set; Drop = high→low; Ramp = low→high; Custom = list per set.
                </div>
              </div>

              {/* FIXED */}
              {(form.weightPattern?.mode || "fixed") === "fixed" && (
                <div>
                  <SmallLabel>Target weight (kg)</SmallLabel>
                  <NumericInput
                    className={inputClass}
                    placeholder="e.g., 40"
                    value={form.weight}
                    onChange={(e) => {
                      const v = e.target.value;
                      upd("weight", v);
                      upd("weightPattern", { ...(form.weightPattern || {}), start: v, end: v, step: "", perSet: "", _stepManual:false });
                    }}
                  />
                </div>
              )}

              {/* DROP / RAMP */}
              {["drop","ramp"].includes(form.weightPattern?.mode || "") && (
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-12 sm:col-span-4">
                    <SmallLabel>Start (kg)</SmallLabel>
                    <NumericInput
                      className={inputClass}
                      value={form.weightPattern?.start ?? ""}
                      onChange={(e)=>upd("weightPattern", { ...(form.weightPattern||{}), start: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <SmallLabel>End (kg)</SmallLabel>
                    <NumericInput
                      className={inputClass}
                      value={form.weightPattern?.end ?? ""}
                      onChange={(e)=>upd("weightPattern", { ...(form.weightPattern||{}), end: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <SmallLabel>Step (kg)</SmallLabel>
                    <div className="flex items-center gap-2">
                      <NumericInput
                        className={inputClass + " flex-1"}
                        value={form.weightPattern?.step ?? ""}
                        onChange={(e)=>{
                          const v = e.target.value;
                          const manual = v !== "";
                          upd("weightPattern", { ...(form.weightPattern||{}), step: v, _stepManual: manual });
                        }}
                      />
                      {/* <Button
                        variant="outline"
                        size="sm"
                        onClick={()=>{
                          const start = form.weightPattern?.start ?? form.weight;
                          const end = form.weightPattern?.end ?? form.weight;
                          const next = autoStepFor(form.dailyTarget, start, end);
                          upd("weightPattern", { ...(form.weightPattern||{}), step: next, _stepManual: false });
                        }}
                      >
                        Auto
                      </Button> */}
                    </div>
                  </div>
                </div>
              )}

              {/* CUSTOM */}
              {(form.weightPattern?.mode || "") === "custom" && (
                <div>
                  <SmallLabel>Per set (comma separated)</SmallLabel>
                  <Input
                    className={inputClass}
                    inputMode="numeric"
                    pattern="[0-9,.\s]*"
                    placeholder="e.g., 60, 55, 50, 45"
                    value={form.weightPattern?.perSet ?? ""}
                    onChange={(e)=>{
                      const v = e.target.value.replace(/[^0-9,.\s]/g, "");
                      upd("weightPattern", { ...(form.weightPattern || {}), perSet: v });
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <SmallLabel>Schedule</SmallLabel>
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-12 md:col-span-6 min-w-0">
                <DayPills
                  value={form.daysOfWeek}
                  onToggle={(i)=>{
                    const on = form.daysOfWeek.includes(i);
                    upd("daysOfWeek", on ? form.daysOfWeek.filter(x=>x!==i) : [...form.daysOfWeek, i].sort());
                  }}
                />
              </div>

              {isGym && (
                <div className="col-span-12 md:col-span-2 min-w-0">
                  <SmallLabel>Basis</SmallLabel>
                  <Segmented
                    value={form.progMode}
                    onChange={(m)=>upd("progMode", m)}
                    options={[
                      { value: "volume", label: "Reps" },
                      { value: "weight", label: "Weight" },
                    ]}
                  />
                </div>
              )}

              <div className={["col-span-6", isGym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
                <SmallLabel>Progression</SmallLabel>
                <Segmented
                  value={form.showProg ? "on" : "off"}
                  onChange={(v)=>upd("showProg", v === "on")}
                  options={[
                    { value: "off", label: "Hide" },
                    { value: "on", label: "Show" },
                  ]}
                />
              </div>

              <div className={["col-span-6", isGym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
                <SmallLabel>Deload</SmallLabel>
                <Segmented
                  value={form.showDeload ? "on" : "off"}
                  onChange={(v)=>upd("showDeload", v === "on")}
                  options={[
                    { value: "off", label: "Hide" },
                    { value: "on", label: "Show" },
                  ]}
                />
              </div>
            </div>
          </div>

          {form.showProg && (
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-12 md:col-span-6">
                <div className="small text-muted-foreground h-5">Progression weekly % (0 disables)</div>
                <Input className={inputClass} type="number" value={form.weeklyPct} onChange={(e)=>upd("weeklyPct", e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-6">
                <div className="small text-muted-foreground h-5">Progression cap (optional)</div>
                <Input className={inputClass} placeholder="e.g., 300" value={form.cap} onChange={(e)=>upd("cap", e.target.value)} />
              </div>
            </div>
          )}

          {form.showDeload && (
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-12 md:col-span-6">
                <div className="small text-muted-foreground h-5">Deload every N weeks (0 disables)</div>
                <Input className={inputClass} type="number" value={form.deloadEvery} onChange={(e)=>upd("deloadEvery", e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-6">
                <div className="small text-muted-foreground h-5">Deload scale (e.g., 0.7 = 70%)</div>
                <Input className={inputClass} type="number" step="0.05" value={form.deloadScale} onChange={(e)=>upd("deloadScale", e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-12 md:col-span-6">
              <div className="small text-muted-foreground h-5">Start date</div>
              <DatePicker
                value={form.startDate || todayLocalISO()}
                onChange={(v)=>upd("startDate", v || todayLocalISO())}
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="small text-muted-foreground h-5">End date (optional)</div>
              <DatePicker value={form.endDate} onChange={(v)=>upd("endDate", v)} />
            </div>
          </div>

          <div className="pt-1">
            <Button className="w-full h-11" onClick={create}>Create template</Button>
          </div>
        </div>
      </div>
    </div>
  );
}