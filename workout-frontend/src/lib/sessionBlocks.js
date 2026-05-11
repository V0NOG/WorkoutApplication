export const BLOCK_TYPES = ["exercise", "rest", "warmup", "cooldown"];

export const defaultAutoSessionSettings = {
  workoutDurationMin: 20,
  fitnessLevel: "beginner",
  restStyle: "standard",
  includeWarmup: true,
  includeCooldown: true,
};

export const defaultDailyPlayerSettings = {
  restBetweenExercisesSec: 45,
  restBetweenRoundsSec: 90,
  baseRestSec: 45,
  increaseRestEveryRounds: 0,
  restIncreaseSec: 10,
  maxRestSec: 120,
  includeWarmup: true,
  includeCooldown: true,
  voiceGuidanceEnabled: false,
  workoutMode: "circuit",
};

export function normalizeSessionBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block, index) => ({
      ...block,
      type: BLOCK_TYPES.includes(block?.type) ? block.type : "exercise",
      name: String(block?.name || block?.type || "Exercise").trim(),
      durationSec: Math.max(1, Math.round(Number(block?.durationSec) || 45)),
      targetReps:
        block?.targetReps === "" || block?.targetReps == null
          ? null
          : Math.max(0, Math.round(Number(block.targetReps) || 0)),
      order: Math.max(0, Math.round(Number(block?.order) || index)),
    }))
    .sort((a, b) => a.order - b.order)
    .map((block, index) => ({ ...block, order: index }));
}

function plannedSetsForItem(item = {}) {
  const tpl = item.templateId || item;
  const planned = Array.isArray(item.setsPlanned) ? item.setsPlanned.map(Number).filter(Number.isFinite) : [];
  if (planned.length) return planned;
  if (tpl.kind === "gym") {
    const count = Math.max(1, Math.round(Number(tpl.dailyTarget) || 1));
    const reps = Math.max(1, Math.round(Number(tpl.defaultSetSize) || 10));
    return Array.from({ length: count }, () => reps);
  }
  const total = Math.max(1, Math.round(Number(tpl.dailyTarget) || Number(item.target) || 1));
  const size = Math.max(1, Math.round(Number(tpl.defaultSetSize) || total));
  const sets = [];
  let remain = total;
  while (remain > 0) {
    sets.push(Math.min(size, remain));
    remain -= size;
  }
  return sets;
}

function plannedWeightsForItem(item = {}, setsCount = 0) {
  const weights = Array.isArray(item.weightsPlanned) ? item.weightsPlanned.map(Number) : [];
  if (weights.length) return weights;
  const tpl = item.templateId || item;
  const fixed = Number(tpl.weightPattern?.start ?? tpl.weight);
  if (Number.isFinite(fixed)) return Array.from({ length: setsCount }, () => fixed);
  return [];
}

function exerciseDurationForItem(item = {}) {
  const tpl = item.templateId || item;
  return tpl.kind === "gym" ? 75 : 50;
}

function itemName(item = {}) {
  return item.templateId?.name || item.name || "Exercise";
}

function restForRound(opts, round, fallback) {
  const base = Math.max(0, Number(opts.baseRestSec ?? fallback) || 0);
  const every = Math.max(0, Math.round(Number(opts.increaseRestEveryRounds) || 0));
  const inc = Math.max(0, Number(opts.restIncreaseSec) || 0);
  const max = Math.max(base, Number(opts.maxRestSec) || base);
  if (!every || !inc) return Math.min(max, base || fallback);
  const steps = Math.max(0, Math.floor((Math.max(1, round) - 1) / every));
  return Math.min(max, base + steps * inc);
}

export function buildDailyWorkoutBlocks(items = [], settings = {}) {
  const opts = { ...defaultDailyPlayerSettings, ...(settings || {}) };
  const workouts = (Array.isArray(items) ? items : [])
    .filter((item) => item?.templateId || item?.name)
    .map((item) => {
      const sets = plannedSetsForItem(item);
      const weights = plannedWeightsForItem(item, sets.length);
      return {
        item,
        name: itemName(item),
        kind: item.templateId?.kind || item.kind || "calisthenics",
        sets,
        weights,
        totalSets: sets.length,
        durationSec: exerciseDurationForItem(item),
      };
    })
    .filter((w) => w.totalSets > 0);

  if (!workouts.length) return [];

  const blocks = [];
  const totalRounds = Math.max(...workouts.map((w) => w.totalSets));

  if (opts.includeWarmup) {
    blocks.push({
      type: "warmup",
      name: "Warm up",
      durationSec: 180,
      targetReps: null,
      round: 0,
      totalRounds,
      completionMode: "timer",
    });
  }

  const addExercise = (workout, setIndex, round) => {
    const reps = workout.sets[setIndex];
    blocks.push({
      type: "exercise",
      name: workout.name,
      workoutName: workout.name,
      dailyInstanceId: workout.item._id,
      templateId: workout.item.templateId?._id || workout.item.templateId,
      durationSec: workout.durationSec,
      targetReps: reps,
      plannedWeight: Number.isFinite(workout.weights[setIndex]) ? workout.weights[setIndex] : null,
      round,
      setNumber: setIndex + 1,
      totalSets: workout.totalSets,
      totalRounds,
      workoutKind: workout.kind,
      completionMode: "manual",
    });
  };

  const addRest = (name, durationSec, round, afterWorkout = null) => {
    blocks.push({
      type: "rest",
      name,
      durationSec,
      targetReps: null,
      workoutName: afterWorkout?.name || "",
      dailyInstanceId: afterWorkout?.item?._id || null,
      templateId: afterWorkout?.item?.templateId?._id || null,
      round,
      totalRounds,
      completionMode: "timer",
    });
  };

  if (opts.workoutMode === "sequential") {
    workouts.forEach((workout, workoutIndex) => {
      for (let setIndex = 0; setIndex < workout.totalSets; setIndex += 1) {
        addExercise(workout, setIndex, setIndex + 1);
        const isLastSet = setIndex === workout.totalSets - 1;
        const isLastWorkout = workoutIndex === workouts.length - 1;
        const roundRest = restForRound(opts, setIndex + 1, opts.restBetweenRoundsSec);
        const exerciseRest = restForRound(opts, setIndex + 1, opts.restBetweenExercisesSec);
        if (!isLastSet) addRest("Rest between sets", exerciseRest, setIndex + 1, workout);
        else if (!isLastWorkout) addRest("Rest before next exercise", roundRest, setIndex + 1, workout);
      }
    });
  } else {
    for (let round = 1; round <= totalRounds; round += 1) {
      const activeThisRound = workouts.filter((workout) => round <= workout.totalSets);
      activeThisRound.forEach((workout, workoutIndex) => {
        addExercise(workout, round - 1, round);
        const isLastExerciseThisRound = workoutIndex === activeThisRound.length - 1;
        const isFinalRound = round === totalRounds;
        const exerciseRest = restForRound(opts, round, opts.restBetweenExercisesSec);
        const roundRest = restForRound(opts, round, opts.restBetweenRoundsSec);
        if (!isLastExerciseThisRound) addRest("Rest between exercises", exerciseRest, round, workout);
        else if (!isFinalRound) addRest("Round rest", roundRest, round, workout);
      });
    }
  }

  if (opts.includeCooldown) {
    blocks.push({
      type: "cooldown",
      name: "Cool down",
      durationSec: 180,
      targetReps: null,
      round: totalRounds,
      totalRounds,
      completionMode: "timer",
    });
  }

  return normalizeSessionBlocks(blocks);
}

function levelDurations(level) {
  if (level === "advanced") return { exercise: 75, rest: 20 };
  if (level === "intermediate") return { exercise: 55, rest: 35 };
  return { exercise: 40, rest: 55 };
}

function restWithStyle(base, style, isGym) {
  let rest = base;
  if (style === "short") rest -= 10;
  if (style === "long") rest += 15;
  if (isGym) rest += 15;
  return Math.max(15, Math.min(90, rest));
}

export function generateSessionBlocks(template = {}, settings = {}) {
  const opts = { ...defaultAutoSessionSettings, ...(settings || {}) };
  const isGym = template.kind === "gym";
  const targetMinutes = Math.max(5, Math.min(180, Number(opts.workoutDurationMin) || 20));
  const targetSec = targetMinutes * 60;
  const durations = levelDurations(opts.fitnessLevel);
  const exerciseSec = isGym ? Math.max(45, durations.exercise) : durations.exercise;
  const restSec = restWithStyle(durations.rest, opts.restStyle, isGym);
  const blocks = [];
  let used = 0;

  if (opts.includeWarmup) {
    blocks.push({ type: "warmup", name: "Warm up", durationSec: 180, targetReps: null });
    used += 180;
  }

  const cooldownSec = opts.includeCooldown ? 180 : 0;
  const exerciseName = template.name || "Exercise";
  const repsPerSet = Math.max(1, Math.round(Number(template.defaultSetSize) || 10));
  const plannedSets = isGym
    ? Math.max(1, Math.round(Number(template.dailyTarget) || 3))
    : Math.max(1, Math.ceil((Number(template.dailyTarget) || repsPerSet) / repsPerSet));
  let round = 1;

  while (used + exerciseSec + cooldownSec <= targetSec && round <= Math.max(plannedSets, 1) * 4) {
    blocks.push({
      type: "exercise",
      name: plannedSets > 1 ? `${exerciseName} ${round}` : exerciseName,
      durationSec: exerciseSec,
      targetReps: repsPerSet,
    });
    used += exerciseSec;
    if (used + restSec + exerciseSec + cooldownSec <= targetSec) {
      blocks.push({ type: "rest", name: "Rest", durationSec: restSec, targetReps: null });
      used += restSec;
    }
    round += 1;
  }

  if (opts.includeCooldown) {
    blocks.push({ type: "cooldown", name: "Cool down", durationSec: cooldownSec || 120, targetReps: null });
  }

  if (!blocks.some((block) => block.type === "exercise")) {
    blocks.push({ type: "exercise", name: exerciseName, durationSec: exerciseSec, targetReps: repsPerSet });
  }

  return normalizeSessionBlocks(blocks);
}

export function fallbackBlocksFromDaily(item = {}) {
  const tpl = item.templateId || item;
  const planned = Array.isArray(item.setsPlanned) && item.setsPlanned.length ? item.setsPlanned : [tpl.defaultSetSize || 10];
  const blocks = [];
  planned.slice(0, 20).forEach((reps, index) => {
    blocks.push({
      type: "exercise",
      name: `${tpl.name || "Exercise"} ${index + 1}`,
      workoutName: tpl.name || "Exercise",
      dailyInstanceId: item._id,
      templateId: tpl._id || item.templateId,
      durationSec: tpl.kind === "gym" ? 60 : 45,
      targetReps: Number(reps) || Number(tpl.defaultSetSize) || 10,
      plannedWeight: Array.isArray(item.weightsPlanned) && Number.isFinite(Number(item.weightsPlanned[index])) ? Number(item.weightsPlanned[index]) : null,
      round: index + 1,
      setNumber: index + 1,
      totalSets: planned.length,
      totalRounds: planned.length,
      workoutKind: tpl.kind || "calisthenics",
      completionMode: "manual",
    });
    if (index < planned.length - 1) {
      blocks.push({
        type: "rest",
        name: "Rest",
        durationSec: tpl.kind === "gym" ? 60 : 35,
        targetReps: null,
        round: index + 1,
        totalRounds: planned.length,
        completionMode: "timer",
      });
    }
  });
  return normalizeSessionBlocks(blocks);
}
