import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import DatePicker from "./DatePicker.jsx";
import { appBus } from "./bus";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Unified input class (kills white borders/rings)
const inputClass =
  "border-0 border-transparent ring-0 shadow-none " +
  "focus:border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "outline-none bg-[#0b1324] text-zinc-100 placeholder-zinc-400 rounded-xl";

export default function Templates() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    name: "",
    unit: "reps",
    dailyTarget: 200,
    defaultSetSize: 20,
    daysOfWeek: [0,1,2,3,4,5,6],
    startDate: "",
    endDate: "",
    weeklyPct: 0,
    cap: "",
    deloadEvery: 0,
    deloadScale: 0.7
  });

  // track which template is being edited and a local draft for it
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  function upd(k, v) { setForm(prev => ({ ...prev, [k]: v })); }
  async function refresh() { setList(await api.listTemplates()); }
  useEffect(()=>{ refresh(); }, []);

  async function create() {
    const payload = {
      name: form.name,
      unit: form.unit,
      dailyTarget: Number(form.dailyTarget),
      defaultSetSize: Number(form.defaultSetSize),
      schedule: {
        type: "weekly",
        daysOfWeek: form.daysOfWeek,
        startDate: form.startDate || new Date().toISOString().slice(0,10),
        endDate: form.endDate || null
      },
      progression: {
        weeklyPct: Number(form.weeklyPct) || 0,
        cap: form.cap ? Number(form.cap) : null,
      },
      deloadRule: {
        everyNWeeks: Number(form.deloadEvery) || 0,
        scale: Number(form.deloadScale) || 0.7
      },
    };
    await api.createTemplate(payload);
    appBus.dispatchEvent(new Event("templates:changed"));
    setForm({ ...form, name:"" });
    refresh();
  }

  async function remove(id) {
    if (!confirm("Delete template?")) return;
    await api.deleteTemplate(id);
    appBus.dispatchEvent(new Event("templates:changed"));
    refresh();
  }

  // ----- Editing helpers -----
  function startEdit(t) {
    setEditingId(t._id);
    setDraft({
      _id: t._id,
      name: t.name ?? "",
      unit: t.unit ?? "reps",
      dailyTarget: t.dailyTarget ?? 0,
      defaultSetSize: t.defaultSetSize ?? 10,
      daysOfWeek: t.schedule?.daysOfWeek?.slice() ?? [0,1,2,3,4,5,6],
      startDate: t.schedule?.startDate ?? "",
      endDate: t.schedule?.endDate ?? "",
      weeklyPct: t.progression?.weeklyPct ?? 0,
      cap: t.progression?.cap ?? "",
      deloadEvery: t.deloadRule?.everyNWeeks ?? 0,
      deloadScale: t.deloadRule?.scale ?? 0.7,
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }
  function dset(k, v) { setDraft(prev => ({ ...prev, [k]: v })); }

  async function saveEdit() {
    if (!editingId || !draft) return;
    const payload = {
      name: draft.name,
      unit: draft.unit,
      dailyTarget: Number(draft.dailyTarget),
      defaultSetSize: Number(draft.defaultSetSize),
      schedule: {
        type: "weekly",
        daysOfWeek: draft.daysOfWeek,
        startDate: draft.startDate || new Date().toISOString().slice(0,10),
        endDate: draft.endDate || null
      },
      progression: {
        weeklyPct: Number(draft.weeklyPct) || 0,
        cap: draft.cap === "" ? null : Number(draft.cap),
      },
      deloadRule: {
        everyNWeeks: Number(draft.deloadEvery) || 0,
        scale: Number(draft.deloadScale) || 0.7
      },
    };
    await api.updateTemplate(editingId, payload); // <-- ensure this exists in your API
    appBus.dispatchEvent(new Event("templates:changed"));
    cancelEdit();
    refresh();
  }

  function toggleDraftDay(i) {
    const on = draft.daysOfWeek.includes(i);
    const next = on ? draft.daysOfWeek.filter(x => x !== i) : [...draft.daysOfWeek, i].sort();
    dset("daysOfWeek", next);
  }

  function DayPills({ value, onToggle }) {
    return (
      <div className="flex flex-wrap gap-2">
        {DOW.map((d, i) => {
          const on = value.includes(i);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggle(i)}
              className={`px-3 py-1 rounded-full appearance-none
                ${on ? "bg-blue-500 text-white border border-transparent"
                     : "bg-transparent border border-border hover:bg-white/5"}
                outline-none ring-0 shadow-none
                focus:outline-none focus:ring-0 focus-visible:ring-0 active:outline-none active:ring-0`}
            >
              {d}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Create Form */}
      <div className="card p-6 space-y-6">
        <div className="text-lg font-semibold">New Template</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name (e.g., Pull-ups)</Label>
              <Input className={inputClass} value={form.name} onChange={e=>upd("name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Daily target</Label>
                <Input className={inputClass} type="number" value={form.dailyTarget} onChange={e=>upd("dailyTarget", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Preferred set size</Label>
                <Input className={inputClass} type="number" value={form.defaultSetSize} onChange={e=>upd("defaultSetSize", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Active days</Label>
              <DayPills value={form.daysOfWeek} onToggle={(i)=>{
                const on = form.daysOfWeek.includes(i);
                upd("daysOfWeek", on ? form.daysOfWeek.filter(x=>x!==i) : [...form.daysOfWeek, i].sort());
              }} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Start date</Label>
                <DatePicker value={form.startDate} onChange={v=>upd("startDate", v)} />
              </div>
              <div className="space-y-1">
                <Label>End date (optional)</Label>
                <DatePicker value={form.endDate} onChange={v=>upd("endDate", v)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Progression weekly % (0 disables)</Label>
                <Input className={inputClass} type="number" value={form.weeklyPct} onChange={e=>upd("weeklyPct", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Progression cap (optional)</Label>
                <Input className={inputClass} placeholder="e.g., 300" value={form.cap} onChange={e=>upd("cap", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Deload every N weeks (0 disables)</Label>
                <Input className={inputClass} type="number" value={form.deloadEvery} onChange={e=>upd("deloadEvery", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Deload scale (e.g., 0.7 = 70%)</Label>
                <Input className={inputClass} type="number" step="0.05" value={form.deloadScale} onChange={e=>upd("deloadScale", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button className="w-full" onClick={create}>Create template</Button>
        </div>
      </div>

      {/* List (with inline edit) */}
      <div className="card p-0 overflow-hidden">
        {list.length === 0 ? (
          <div className="p-6 small text-muted-foreground">No templates yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {list.map(t => {
              const isEditing = editingId === t._id;
              if (!isEditing) {
                return (
                  <div key={t._id} className="p-4 md:p-5 flex items-start gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">{t.name}</div>
                      <div className="small text-muted-foreground">
                        {t.dailyTarget}/{t.unit} • set {t.defaultSetSize} • Days: {t.schedule?.daysOfWeek?.map(i=>DOW[i]).join(", ")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={()=>startEdit(t)}>Edit</Button>
                      <Button variant="outline" onClick={()=>remove(t._id)}>Delete</Button>
                    </div>
                  </div>
                );
              }

              // Editing row
              return (
                <div key={t._id} className="p-4 md:p-5 space-y-4 bg-white/5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input className={inputClass} value={draft.name} onChange={e=>dset("name", e.target.value)} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Daily target</Label>
                          <Input className={inputClass} type="number" value={draft.dailyTarget} onChange={e=>dset("dailyTarget", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Preferred set size</Label>
                          <Input className={inputClass} type="number" value={draft.defaultSetSize} onChange={e=>dset("defaultSetSize", e.target.value)} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Active days</Label>
                        <DayPills value={draft.daysOfWeek} onToggle={toggleDraftDay} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Start date</Label>
                          <DatePicker value={draft.startDate} onChange={v=>dset("startDate", v)} />
                        </div>
                        <div className="space-y-1">
                          <Label>End date (optional)</Label>
                          <DatePicker value={draft.endDate} onChange={v=>dset("endDate", v)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Progression weekly %</Label>
                          <Input className={inputClass} type="number" value={draft.weeklyPct} onChange={e=>dset("weeklyPct", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Progression cap</Label>
                          <Input className={inputClass} placeholder="e.g., 300" value={draft.cap} onChange={e=>dset("cap", e.target.value)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Deload every N weeks</Label>
                          <Input className={inputClass} type="number" value={draft.deloadEvery} onChange={e=>dset("deloadEvery", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Deload scale</Label>
                          <Input className={inputClass} type="number" step="0.05" value={draft.deloadScale} onChange={e=>dset("deloadScale", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                    <Button onClick={saveEdit}>Save</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}