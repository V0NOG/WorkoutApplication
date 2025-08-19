import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import DatePicker from "./DatePicker.jsx";
import { pingTemplatesChanged } from "./bus";
import GroupCombo from "./components/GroupCombo.jsx";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const inputClass =
  "h-11 rounded-xl border border-input bg-background text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring " +
  "transition-all duration-300";

function DayPills({ value, onToggle }) {
  return (
    <div className="w-full flex flex-wrap items-center gap-2">
      {DOW.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onToggle(i)}
            className={[
              "px-3 py-1 rounded-full appearance-none outline-none ring-0 shadow-none transition-colors",
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

// UPDATED: container now w-full/min-w-0/overflow-hidden, buttons are flex-1 text-center
function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div
      className={[
        // OLD LOOK (restored)
        "inline-flex h-10 items-center rounded-lg border border-input bg-muted px-1",
        // containment without changing the look
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
              // OLD BUTTON LOOK (restored)
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

function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 10); // YYYY-MM-DD in local time
}

export default function Templates() {
  const [list, setList] = useState([]);

  const [form, setForm] = useState({
    name: "",
    kind: "calisthenics",     // calisthenics | gym
    group: "",
    unit: "reps",
    dailyTarget: 200,         // Cali: daily target | Gym: # sets
    defaultSetSize: 20,       // Cali: set size      | Gym: # reps
    weight: "",               // Gym-only
    // Default to weekdays only (Mon–Fri)
    daysOfWeek: [1,2,3,4,5],
    startDate: todayLocalISO(),
    endDate: "",
    // Progression & Deload
    progMode: "volume",       // "volume" | "weight"
    weeklyPct: 0,
    cap: "",
    deloadEvery: 0,
    deloadScale: 0.7,
    // visibility toggles
    showProg: false,
    showDeload: false,
  });

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  // Inline delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function upd(k, v)  { setForm((p) => ({ ...p, [k]: v })); }
  function dset(k, v) { setDraft((p) => ({ ...p, [k]: v })); }

  async function refresh() { setList(await api.listTemplates()); }
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!form.startDate) upd("startDate", todayLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupOptions = useMemo(() => {
    const s = new Set(list.map(t => (t.group || "").trim()).filter(Boolean));
    return Array.from(s).sort((a,b) => a.localeCompare(b));
  }, [list]);

  async function create() {
    const weeklyPct   = form.showProg    ? (Number(form.weeklyPct) || 0) : 0;
    const capVal      = form.showProg    ? (form.cap ? Number(form.cap) : null) : null;
    const deloadEvery = form.showDeload  ? (Number(form.deloadEvery) || 0) : 0;
    const deloadScale = form.showDeload  ? (Number(form.deloadScale) || 0.7) : 0.7;

    const payload = {
      name: form.name,
      kind: form.kind,
      group: (form.group || "").trim(),
      unit: form.unit,
      dailyTarget: Number(form.dailyTarget),
      defaultSetSize: Number(form.defaultSetSize),
      ...(form.kind === "gym" && {
        weight: form.weight === "" ? null : Number(form.weight),
      }),
      schedule: {
        type: "weekly",
        daysOfWeek: form.daysOfWeek,
        startDate: form.startDate || new Date().toISOString().slice(0,10),
        endDate: form.endDate || null,
      },
      progression: {
        mode: form.progMode,
        weeklyPct,
        cap: capVal,
      },
      deloadRule: {
        mode: form.progMode,
        everyNWeeks: deloadEvery,
        scale: deloadScale,
      },
    };
    await api.createTemplate(payload);
    pingTemplatesChanged();
    setForm((p) => ({ ...p, name: "" }));
    refresh();
  }

  // Themed inline delete confirmation (replaces native confirm)
  function askDelete(id) {
    setConfirmDeleteId(id);
  }
  async function doDelete(id) {
    setDeleting(true);
    try {
      await api.deleteTemplate(id);
      pingTemplatesChanged();
      await refresh();
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
    });
  }
  function cancelEdit() { setEditingId(null); setDraft(null); setConfirmDeleteId(null); }

  async function saveEdit() {
    if (!editingId || !draft) return;

    const weeklyPct   = draft.showProg    ? (Number(draft.weeklyPct) || 0) : 0;
    const capVal      = draft.showProg    ? (draft.cap === "" ? null : Number(draft.cap)) : null;
    const deloadEvery = draft.showDeload  ? (Number(draft.deloadEvery) || 0) : 0;
    const deloadScale = draft.showDeload  ? (Number(draft.deloadScale) || 0.7) : 0.7;

    const payload = {
      name: draft.name,
      kind: draft.kind,
      group: (draft.group || "").trim(),
      unit: draft.unit,
      dailyTarget: Number(draft.dailyTarget),
      defaultSetSize: Number(draft.defaultSetSize),
      ...(draft.kind === "gym" && {
        weight: draft.weight === "" ? null : Number(draft.weight),
      }),
      schedule: {
        type: "weekly",
        daysOfWeek: draft.daysOfWeek,
        startDate: draft.startDate || new Date().toISOString().slice(0,10),
        endDate: draft.endDate || null,
      },
      progression: {
        mode: draft.progMode,
        weeklyPct,
        cap: capVal,
      },
      deloadRule: {
        mode: draft.progMode,
        everyNWeeks: deloadEvery,
        scale: deloadScale,
      },
    };

    await api.updateTemplate(editingId, payload);
    pingTemplatesChanged();
    cancelEdit();
    refresh();
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
      {/* Header: Kind + Group */}
      <div className="card p-6">
        <div className="grid grid-cols-12 gap-4 items-end">
          {/* Title column: label spacer + h-11 row to align with inputs */}
          <div className="col-span-12 md:col-span-3">
            <div className="small text-muted-foreground h-5 select-none opacity-0">.</div>
            <div className="h-11 flex items-center text-xl font-semibold">
              New Template
            </div>
          </div>

          {/* Type (segmented) */}
          <div className="col-span-12 sm:col-span-4 md:col-span-3">
            <div className="small text-muted-foreground h-5">Type</div>
            <Segmented
              className="text-base"  // slightly larger text in this header row
              value={form.kind}
              onChange={(k) => upd("kind", k)}
              options={[
                { value: "calisthenics", label: "Calisthenics" },
                { value: "gym", label: "Gym" },
              ]}
            />
          </div>

          {/* Group (combo) */}
          <div className="col-span-12 sm:col-span-5 md:col-span-6">
            <div className="small text-muted-foreground h-5">Group (type to create or pick)</div>
            <GroupCombo
              options={groupOptions}
              value={form.group}
              onChange={(v) => upd("group", v)}
              placeholder="Back Day, Push Day, Core…"
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Create form */}
      <div className="card p-6 space-y-6">
        {/* Name */}
        <div>
          <div className="small text-muted-foreground h-5">Name (e.g., Pull-ups / Bench Press)</div>
          <Input className={inputClass} value={form.name} onChange={(e)=>upd("name", e.target.value)} />
        </div>

        {/* Targets (responsive + animated) */}
        <div className="grid grid-cols-12 gap-4 items-end">
          <div className={["col-span-12", isGym ? "md:col-span-4" : "md:col-span-6", "transition-all duration-300"].join(" ")}>
            <div className="small text-muted-foreground h-5">
              {isGym ? "Number of sets (per day)" : "Daily target"}
            </div>
            <Input className={inputClass} type="number" value={form.dailyTarget} onChange={(e)=>upd("dailyTarget", e.target.value)} />
          </div>

          <div className={["col-span-12", isGym ? "md:col-span-4" : "md:col-span-6", "transition-all duration-300"].join(" ")}>
            <div className="small text-muted-foreground h-5">
              {isGym ? "Number of reps (per set)" : "Preferred set size"}
            </div>
            <Input className={inputClass} type="number" value={form.defaultSetSize} onChange={(e)=>upd("defaultSetSize", e.target.value)} />
          </div>

          {/* Weight only for gym; animates in/out */}
          <div className={["col-span-12 transition-all duration-300", isGym ? "md:col-span-4 opacity-100" : "md:col-span-0 opacity-0 pointer-events-none h-0 overflow-hidden"].join(" ")}>
            {isGym && (
              <>
                <div className="small text-muted-foreground h-5">Target weight (kg)</div>
                <Input className={inputClass} type="number" placeholder="e.g., 40" value={form.weight} onChange={(e)=>upd("weight", e.target.value)} />
              </>
            )}
          </div>
        </div>

        {/* SCHEDULE ROW: Active days + Basis + Progression + Deload (inline, no wrap) */}
        <div>
          <div className="small text-muted-foreground h-5">Schedule</div>
          <div className="grid grid-cols-12 gap-4 items-end">
            {/* Active days */}
            <div className="col-span-12 md:col-span-6 min-w-0">
              <DayPills
                value={form.daysOfWeek}
                onToggle={(i)=>{
                  const on = form.daysOfWeek.includes(i);
                  upd("daysOfWeek", on ? form.daysOfWeek.filter(x=>x!==i) : [...form.daysOfWeek, i].sort());
                }}
              />
            </div>

            {/* Basis: render ONLY for gym to avoid phantom column; fits cell width */}
            {isGym && (
              <div className="col-span-12 md:col-span-2 min-w-0">
                <div className="small text-muted-foreground h-5">Basis</div>
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

            {/* Progression toggle */}
            <div className={["col-span-6", isGym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
              <div className="small text-muted-foreground h-5">Progression</div>
              <Segmented
                value={form.showProg ? "on" : "off"}
                onChange={(v)=>upd("showProg", v === "on")}
                options={[
                  { value: "off", label: "Hide" },
                  { value: "on", label: "Show" },
                ]}
              />
            </div>

            {/* Deload toggle */}
            <div className={["col-span-6", isGym ? "md:col-span-2" : "md:col-span-3", "min-w-0"].join(" ")}>
              <div className="small text-muted-foreground h-5">Deload</div>
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

        {/* Progression inputs */}
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

        {/* Deload inputs */}
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

        {/* Schedule dates */}
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

      {/* List grouped by group */}
      <div className="card p-0">
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
                      const totalReps = gym
                        ? Number(t.dailyTarget || 0) * Number(t.defaultSetSize || 0)
                        : null;

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
                                  {t.weight != null ? ` • ${t.weight} kg` : ""}
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
                      <div key={t._id} className="p-4 md:p-5 space-y-5 bg-white/40 dark:bg-white/5">
                        <div className="grid grid-cols-12 gap-4 items-end">
                          <div className="col-span-12 sm:col-span-4">
                            <Label>Type</Label>
                            <Segmented
                              value={draft.kind}
                              onChange={(k)=>dset("kind", k)}
                              options={[
                                { value: "calisthenics", label: "Calisthenics" },
                                { value: "gym", label: "Gym" },
                              ]}
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-8">
                            <Label>Group (type to create or pick)</Label>
                            <GroupCombo
                              options={groupOptions}
                              value={draft.group}
                              onChange={(v)=>dset("group", v)}
                              placeholder="Back Day, Push Day, Core…"
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Name</Label>
                          <Input className={inputClass} value={draft.name} onChange={(e)=>dset("name", e.target.value)} />
                        </div>

                        {/* Targets (animated) */}
                        <div className="grid grid-cols-12 gap-4 items-end">
                          <div className={["col-span-12", gym ? "md:col-span-4" : "md:col-span-6", "transition-all duration-300"].join(" ")}>
                            <Label>{gym ? "Number of sets (per day)" : "Daily target"}</Label>
                            <Input className={inputClass} type="number" value={draft.dailyTarget} onChange={(e)=>dset("dailyTarget", e.target.value)} />
                          </div>
                          <div className={["col-span-12", gym ? "md:col-span-4" : "md:col-span-6", "transition-all duration-300"].join(" ")}>
                            <Label>{gym ? "Number of reps (per set)" : "Preferred set size"}</Label>
                            <Input className={inputClass} type="number" value={draft.defaultSetSize} onChange={(e)=>dset("defaultSetSize", e.target.value)} />
                          </div>
                          <div className={["col-span-12 transition-all duration-300", gym ? "md:col-span-4 opacity-100" : "md:col-span-0 opacity-0 pointer-events-none h-0 overflow-hidden"].join(" ")}>
                            {gym && (
                              <>
                                <Label>Target weight (kg)</Label>
                                <Input className={inputClass} type="number" value={draft.weight} onChange={(e)=>dset("weight", e.target.value)} />
                              </>
                            )}
                          </div>
                        </div>

                        {/* SCHEDULE ROW (Edit): Active days + Basis + Progression + Deload */}
                        <div>
                          <Label>Schedule</Label>
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
                                <Label>Basis</Label>
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
                              <Label>Progression</Label>
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
                              <Label>Deload</Label>
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

                        {/* Progression inputs */}
                        {draft.showProg && (
                          <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-12 md:col-span-6">
                              <Label>Progression weekly %</Label>
                              <Input className={inputClass} type="number" value={draft.weeklyPct} onChange={(e)=>dset("weeklyPct", e.target.value)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Label>Progression cap</Label>
                              <Input className={inputClass} placeholder="e.g., 300" value={draft.cap} onChange={(e)=>dset("cap", e.target.value)} />
                            </div>
                          </div>
                        )}

                        {/* Deload inputs */}
                        {draft.showDeload && (
                          <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-12 md:col-span-6">
                              <Label>Deload every N weeks</Label>
                              <Input className={inputClass} type="number" value={draft.deloadEvery} onChange={(e)=>dset("deloadEvery", e.target.value)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Label>Deload scale</Label>
                              <Input className={inputClass} type="number" step="0.05" value={draft.deloadScale} onChange={(e)=>dset("deloadScale", e.target.value)} />
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
    </div>
  );
}