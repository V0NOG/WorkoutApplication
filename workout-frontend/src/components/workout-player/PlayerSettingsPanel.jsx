import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import PlayerCheckbox from "./PlayerCheckbox.jsx";

export default function PlayerSettingsPanel({ settings, onChange, onGenerateCircuit, onGenerateSequential, onClear, onReset }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const patch = (next) => onChange({ ...settings, ...next });
  return (
    <div className="card p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Quick setup</div>
          <div className="small">Choose a structure, then fine tune only if needed.</div>
        </div>
        <Button variant="outline" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <div className="small">Mode</div>
          <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={settings.workoutMode} onChange={(e) => patch({ workoutMode: e.target.value })}>
            <option value="circuit">Circuit</option>
            <option value="sequential">Sequential</option>
          </select>
        </label>
        <label className="space-y-1">
          <div className="small">Base rest</div>
          <Input type="number" value={settings.baseRestSec} onChange={(e) => patch({ baseRestSec: Number(e.target.value) || 0, restBetweenExercisesSec: Number(e.target.value) || 0 })} />
        </label>
        <PlayerCheckbox checked={!!settings.includeWarmup} onChange={(includeWarmup) => patch({ includeWarmup })} label="Warmup" />
        <PlayerCheckbox checked={!!settings.includeCooldown} onChange={(includeCooldown) => patch({ includeCooldown })} label="Cooldown" />
        <div className="sm:col-span-2">
          <PlayerCheckbox
            checked={!!settings.voiceGuidanceEnabled}
            onChange={(voiceGuidanceEnabled) => patch({ voiceGuidanceEnabled })}
            label="Voice guidance"
            description="Announces exercises, rests, and final countdowns."
          />
        </div>
      </div>

      {advancedOpen && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-2">
          <label className="space-y-1">
            <div className="small">Round rest</div>
            <Input type="number" value={settings.restBetweenRoundsSec} onChange={(e) => patch({ restBetweenRoundsSec: Number(e.target.value) || 0 })} />
          </label>
          <label className="space-y-1">
            <div className="small">Max rest</div>
            <Input type="number" value={settings.maxRestSec} onChange={(e) => patch({ maxRestSec: Number(e.target.value) || 0 })} />
          </label>
          <label className="space-y-1">
            <div className="small">Increase every rounds</div>
            <Input type="number" value={settings.increaseRestEveryRounds} onChange={(e) => patch({ increaseRestEveryRounds: Number(e.target.value) || 0 })} />
          </label>
          <label className="space-y-1">
            <div className="small">Increase by</div>
            <Input type="number" value={settings.restIncreaseSec} onChange={(e) => patch({ restIncreaseSec: Number(e.target.value) || 0 })} />
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="whitespace-normal" onClick={onGenerateCircuit}>Generate Circuit</Button>
        <Button className="whitespace-normal" variant="outline" onClick={onGenerateSequential}>Generate Sequential</Button>
        <Button className="whitespace-normal" variant="outline" onClick={onReset}>Reset to Suggested Flow</Button>
        <Button className="whitespace-normal" variant="outline" onClick={onClear}>Clear Flow</Button>
      </div>
    </div>
  );
}
