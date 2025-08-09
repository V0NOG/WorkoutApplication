import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import DatePicker from "./DatePicker.jsx";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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
    setForm({ ...form, name:"" });
    refresh();
  }

  async function remove(id) {
    if (!confirm("Delete template?")) return;
    await api.deleteTemplate(id);
    refresh();
  }

  return (
    <div className="stack">
      {/* Form */}
      <div className="card p-6 space-y-6">
        <div className="text-lg font-semibold">New Template</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name (e.g., Pull-ups)</Label>
              <Input value={form.name} onChange={e=>upd("name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Daily target</Label>
                <Input type="number" value={form.dailyTarget} onChange={e=>upd("dailyTarget", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Preferred set size</Label>
                <Input type="number" value={form.defaultSetSize} onChange={e=>upd("defaultSetSize", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Active days</Label>
              <div className="flex flex-wrap gap-2">
                {DOW.map((d, i)=> {
                  const on = form.daysOfWeek.includes(i);
                  return (
                    <button
                      key={d}
                      onClick={()=> upd("daysOfWeek", on ? form.daysOfWeek.filter(x=>x!==i) : [...form.daysOfWeek, i].sort())}
                      className={`px-3 py-1 rounded-full border ${on ? "bg-blue-500 text-white" : "bg-transparent border-border hover:bg-white/5"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
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
                <Input type="number" value={form.weeklyPct} onChange={e=>upd("weeklyPct", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Progression cap (optional)</Label>
                <Input placeholder="e.g., 300" value={form.cap} onChange={e=>upd("cap", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Deload every N weeks (0 disables)</Label>
                <Input type="number" value={form.deloadEvery} onChange={e=>upd("deloadEvery", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Deload scale (e.g., 0.7 = 70%)</Label>
                <Input type="number" step="0.05" value={form.deloadScale} onChange={e=>upd("deloadScale", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button className="w-full" onClick={create}>Create template</Button>
        </div>
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        {list.length === 0 ? (
          <div className="p-6 small text-muted-foreground">No templates yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {list.map(t => (
              <div key={t._id} className="p-4 md:p-5 flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="small text-muted-foreground">
                    {t.dailyTarget}/{t.unit} • set {t.defaultSetSize} • Days: {t.schedule?.daysOfWeek?.map(i=>DOW[i]).join(", ")}
                  </div>
                </div>
                <Button variant="outline" onClick={()=>remove(t._id)}>Delete</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}