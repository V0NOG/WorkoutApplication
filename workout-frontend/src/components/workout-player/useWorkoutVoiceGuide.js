import { useEffect, useRef, useState } from "react";

function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function isTimerBlock(block) {
  return block?.type === "rest" || block?.type === "warmup" || block?.type === "cooldown";
}

function durationText(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  if (sec >= 60 && sec % 60 === 0) {
    const min = sec / 60;
    return `${min} minute${min === 1 ? "" : "s"}`;
  }
  if (sec >= 75) {
    const min = Math.floor(sec / 60);
    const remain = sec % 60;
    return remain ? `${min} minute${min === 1 ? "" : "s"} and ${remain} seconds` : `${min} minutes`;
  }
  return `${sec} seconds`;
}

function blockAnnouncement(block) {
  if (!block) return "";

  if (block.type === "rest") return `Rest now. ${durationText(block.durationSec)}.`;
  if (block.type === "warmup") return `Warm up starts now. ${durationText(block.durationSec)}.`;
  if (block.type === "cooldown") return `Cooldown starts now. ${durationText(block.durationSec)}.`;

  const name = block.workoutName || block.name || "your next exercise";
  const setText = block.setNumber && block.totalSets ? ` Set ${block.setNumber} of ${block.totalSets}.` : "";
  const hasWeight = block.plannedWeight != null && block.plannedWeight !== "";
  const targetText = block.targetReps
    ? ` Aim for ${block.targetReps} reps${hasWeight ? ` at ${block.plannedWeight} kilograms` : ""}.`
    : hasWeight
      ? ` Use ${block.plannedWeight} kilograms.`
      : "";

  return `Next up, ${name}.${setText}${targetText}`;
}

function voiceScore(voice) {
  const name = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
  const lang = `${voice?.lang || ""}`.toLowerCase();
  if (!lang.startsWith("en")) return -100;

  let score = voice.localService ? 4 : 0;
  if (/samantha/.test(name)) score += 50;
  if (/google/.test(name)) score += 40;
  if (/microsoft/.test(name)) score += 35;
  if (/natural|enhanced|premium|neural|online/.test(name)) score += 30;
  if (/english|united states|united kingdom|australia/.test(name)) score += 8;
  if (/default|compact|robot|basic/.test(name)) score -= 12;
  return score;
}

function chooseNaturalVoice() {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) return null;
  return voices
    .filter((voice) => `${voice.lang || ""}`.toLowerCase().startsWith("en"))
    .sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}

export default function useWorkoutVoiceGuide({
  enabled,
  block,
  blockIndex,
  remainingSec,
  running,
  started,
  finished,
  status,
}) {
  const announcedBlock = useRef(null);
  const countdownKey = useRef("");
  const announcedComplete = useRef(false);
  const [voice, setVoice] = useState(null);

  function cancel() {
    if (hasSpeech()) window.speechSynthesis.cancel();
  }

  function speak(text) {
    if (!enabled || !text || !hasSpeech()) return;
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.voice = voice || chooseNaturalVoice();
    utterance.lang = utterance.voice?.lang || "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 0.98;
    utterance.volume = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (!hasSpeech()) return undefined;

    function refreshVoices() {
      setVoice(chooseNaturalVoice());
    }

    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
    }

    const previousHandler = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = previousHandler;
    };
  }, []);

  useEffect(() => {
    if (!enabled) cancel();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !started || finished || !running || !block) return;
    if (announcedBlock.current === blockIndex) return;
    announcedBlock.current = blockIndex;
    countdownKey.current = "";
    speak(blockAnnouncement(block));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, started, finished, running, blockIndex, block, voice]);

  useEffect(() => {
    if (!enabled || !started || finished || !running || !isTimerBlock(block)) return;
    const sec = Math.round(Number(remainingSec) || 0);
    if (sec < 1 || sec > 5) return;
    const key = `${blockIndex}:${sec}`;
    if (countdownKey.current === key) return;
    countdownKey.current = key;
    speak(String(sec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, started, finished, running, blockIndex, remainingSec, block, voice]);

  useEffect(() => {
    if (!enabled || !finished || status !== "completed" || announcedComplete.current) return;
    announcedComplete.current = true;
    speak("Workout complete. Nice work.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, finished, status, voice]);

  return { cancelVoice: cancel };
}
