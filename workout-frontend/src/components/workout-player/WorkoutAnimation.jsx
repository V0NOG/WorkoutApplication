import React from "react";

function kindFor(block = {}) {
  const text = `${block.type || ""} ${block.name || ""} ${block.workoutName || ""}`.toLowerCase();
  if (block.type === "rest") return "rest";
  if (block.type === "warmup" || block.type === "cooldown" || /mobility|stretch/.test(text)) return "mobility";
  if (/push|press|chest|bench/.test(text)) return "push";
  if (/squat|leg|lunge|quad|glute/.test(text)) return "squat";
  if (/pull|row|back|lat|chin/.test(text)) return "pull";
  if (/plank|core|abs|crunch|sit/.test(text)) return "core";
  if (/run|cardio|jump|burpee|skip/.test(text)) return "cardio";
  return "strength";
}

const config = {
  push: { label: "Press", accent: "#3b82f6", soft: "rgba(59, 130, 246, .15)" },
  squat: { label: "Drive", accent: "#10b981", soft: "rgba(16, 185, 129, .15)" },
  pull: { label: "Pull", accent: "#06b6d4", soft: "rgba(6, 182, 212, .15)" },
  core: { label: "Hold", accent: "#8b5cf6", soft: "rgba(139, 92, 246, .15)" },
  cardio: { label: "Move", accent: "#f43f5e", soft: "rgba(244, 63, 94, .15)" },
  rest: { label: "Breathe", accent: "#0ea5e9", soft: "rgba(14, 165, 233, .15)" },
  mobility: { label: "Mobility", accent: "#84cc16", soft: "rgba(132, 204, 22, .15)" },
  strength: { label: "Strength", accent: "#6366f1", soft: "rgba(99, 102, 241, .15)" },
};

function Scene({ children, showFloor = true }) {
  return (
    <svg className="wa-svg" viewBox="0 0 320 190" role="img" aria-hidden="true">
      {showFloor ? <path className="wa-floor-line" d="M58 154 C96 151 226 151 264 154" /> : null}
      <ellipse className="wa-shadow" cx="160" cy="160" rx="78" ry="12" />
      {children}
    </svg>
  );
}

function PushIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-push-figure">
        <path className="wa-body-wide" d="M90 116 C124 101 174 98 221 108" />
        <circle className="wa-head" cx="242" cy="107" r="15" />
        <path className="wa-limb-main wa-bend-front" d="M191 109 C188 122 185 134 178 145" />
        <path className="wa-limb-soft wa-bend-front" d="M219 109 C224 122 224 135 216 145" />
        <path className="wa-limb-main" d="M98 116 C81 122 66 135 55 148" />
        <path className="wa-limb-soft" d="M120 111 C101 120 86 134 75 148" />
      </g>
    </Scene>
  );
}

function SquatIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-squat-figure">
        <circle className="wa-head" cx="160" cy="50" r="15" />
        <path className="wa-torso-fill" d="M139 75 C145 65 175 65 181 75 C188 90 185 109 174 121 C166 129 153 129 145 121 C134 109 132 90 139 75Z" />
        <path className="wa-limb-main" d="M142 87 C124 90 108 99 93 111" />
        <path className="wa-limb-soft" d="M178 87 C196 90 212 99 227 111" />
        <path className="wa-leg-main" d="M147 118 C134 128 124 142 111 151 C102 157 89 154 82 150" />
        <path className="wa-leg-soft" d="M173 118 C186 128 196 142 209 151 C218 157 231 154 238 150" />
      </g>
    </Scene>
  );
}

function PullIllustration() {
  return (
    <Scene>
      <path className="wa-bar" d="M82 44 H238" />
      <g className="wa-figure wa-pull-figure">
        <circle className="wa-head" cx="160" cy="77" r="15" />
        <path className="wa-torso-fill" d="M137 101 C144 89 176 89 183 101 C190 116 185 139 174 149 C165 156 154 156 146 149 C135 139 130 116 137 101Z" />
        <path className="wa-limb-main" d="M141 101 C128 83 119 64 111 47" />
        <path className="wa-limb-soft" d="M179 101 C192 83 201 64 209 47" />
        <path className="wa-leg-main" d="M149 146 C143 157 136 165 127 172" />
        <path className="wa-leg-soft" d="M171 146 C177 157 184 165 193 172" />
      </g>
    </Scene>
  );
}

function CoreIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-core-figure">
        <path className="wa-body-wide" d="M87 116 C126 107 178 106 222 113" />
        <circle className="wa-head" cx="243" cy="113" r="15" />
        <path className="wa-limb-main" d="M190 114 C186 128 181 139 174 148" />
        <path className="wa-limb-soft" d="M216 114 C218 127 216 139 209 148" />
        <path className="wa-limb-main" d="M92 116 C76 123 63 134 52 148" />
        <path className="wa-limb-soft" d="M114 112 C96 122 82 135 72 149" />
      </g>
    </Scene>
  );
}

function CardioIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-cardio-figure">
        <circle className="wa-head" cx="160" cy="50" r="15" />
        <path className="wa-torso-fill" d="M141 75 C150 65 174 68 181 79 C188 96 182 115 169 124 C159 131 146 126 140 116 C132 102 132 86 141 75Z" />
        <path className="wa-limb-main" d="M142 87 C127 83 113 73 101 59" />
        <path className="wa-limb-soft" d="M178 89 C194 96 208 109 221 125" />
        <path className="wa-leg-main" d="M150 121 C137 130 127 142 117 156" />
        <path className="wa-leg-soft" d="M170 122 C184 126 199 135 213 147" />
      </g>
      <path className="wa-motion-line" d="M72 82 C84 78 96 78 108 82" />
      <path className="wa-motion-line wa-delay" d="M214 68 C226 64 238 64 250 68" />
    </Scene>
  );
}

function MobilityIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-mobility-figure">
        <circle className="wa-head" cx="160" cy="50" r="15" />
        <path className="wa-torso-fill" d="M139 75 C147 64 173 64 181 75 C189 92 184 117 171 128 C162 136 149 131 143 120 C134 103 131 88 139 75Z" />
        <path className="wa-limb-main" d="M145 82 C130 69 118 56 107 42" />
        <path className="wa-limb-soft" d="M176 83 C193 75 207 63 219 49" />
        <path className="wa-leg-main" d="M150 124 C140 134 132 146 124 158" />
        <path className="wa-leg-soft" d="M170 124 C181 136 190 147 198 158" />
      </g>
      <path className="wa-arc" d="M109 43 C132 21 187 22 211 44" />
    </Scene>
  );
}

function StrengthIllustration() {
  return (
    <Scene>
      <g className="wa-figure wa-strength-figure">
        <path className="wa-weight-bar" d="M78 72 H242" />
        <rect className="wa-weight" x="58" y="58" width="20" height="28" rx="7" />
        <rect className="wa-weight" x="242" y="58" width="20" height="28" rx="7" />
        <circle className="wa-head" cx="160" cy="50" r="15" />
        <path className="wa-torso-fill" d="M137 76 C145 65 175 65 183 76 C190 92 186 118 174 129 C165 137 153 137 146 129 C134 118 130 92 137 76Z" />
        <path className="wa-limb-main" d="M138 86 C124 77 106 73 83 72" />
        <path className="wa-limb-soft" d="M182 86 C196 77 214 73 237 72" />
        <path className="wa-leg-main" d="M149 127 C139 137 130 149 121 160" />
        <path className="wa-leg-soft" d="M171 127 C181 137 190 149 199 160" />
      </g>
    </Scene>
  );
}

function RestIllustration() {
  return (
    <svg className="wa-svg" viewBox="0 0 320 190" role="img" aria-hidden="true">
      <ellipse className="wa-shadow" cx="160" cy="160" rx="76" ry="12" />
      <g className="wa-rest-rings">
        <circle cx="160" cy="96" r="57" />
        <circle cx="160" cy="96" r="37" />
        <circle cx="160" cy="96" r="16" />
      </g>
    </svg>
  );
}

const illustrations = {
  push: PushIllustration,
  squat: SquatIllustration,
  pull: PullIllustration,
  core: CoreIllustration,
  cardio: CardioIllustration,
  rest: RestIllustration,
  mobility: MobilityIllustration,
  strength: StrengthIllustration,
};

export default function WorkoutAnimation({ block }) {
  const kind = kindFor(block);
  const c = config[kind] || config.strength;
  const Illustration = illustrations[kind] || illustrations.strength;

  return (
    <div
      className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm"
      style={{ "--wa-accent": c.accent, "--wa-soft": c.soft }}
    >
      <style>{`
        @keyframes wa-push { 0%, 100% { transform: translateY(0) rotate(.3deg); } 50% { transform: translateY(8px) rotate(-.4deg); } }
        @keyframes wa-squat { 0%, 100% { transform: translateY(-4px); } 50% { transform: translateY(16px); } }
        @keyframes wa-pull { 0%, 100% { transform: translateY(11px); } 50% { transform: translateY(-5px); } }
        @keyframes wa-core { 0%, 100% { transform: translateY(0) scaleX(1); } 50% { transform: translateY(-1px) scaleX(1.018); } }
        @keyframes wa-cardio { 0%, 100% { transform: translateY(7px) rotate(-.8deg); } 50% { transform: translateY(-11px) rotate(.8deg); } }
        @keyframes wa-mobility { 0%, 100% { transform: rotate(-3.5deg) translateX(-2px); } 50% { transform: rotate(4deg) translateX(2px); } }
        @keyframes wa-strength { 0%, 100% { transform: translateY(8px); } 50% { transform: translateY(-6px); } }
        @keyframes wa-breathe { 0%, 100% { transform: scale(.78); opacity: .28; } 50% { transform: scale(1.12); opacity: .72; } }
        @keyframes wa-motion { 0% { stroke-dashoffset: 34; opacity: 0; } 40% { opacity: .62; } 100% { stroke-dashoffset: -34; opacity: 0; } }
        @keyframes wa-shadow { 0%, 100% { transform: scaleX(.94); opacity: .34; } 50% { transform: scaleX(1.08); opacity: .58; } }

        .wa-stage { position: relative; height: 196px; overflow: hidden; border-radius: 1rem; background:
          radial-gradient(circle at 50% 42%, var(--wa-soft), transparent 42%),
          linear-gradient(180deg, rgba(148, 163, 184, .10), transparent 70%);
        }
        .wa-svg { display: block; height: 196px; width: 100%; }
        .wa-figure { transform-box: fill-box; transform-origin: center; animation: wa-strength 1.8s cubic-bezier(.45, 0, .25, 1) infinite; }
        .wa-push-figure { animation-name: wa-push; animation-duration: 1.55s; }
        .wa-squat-figure { animation-name: wa-squat; animation-duration: 1.8s; }
        .wa-pull-figure { animation-name: wa-pull; animation-duration: 1.72s; }
        .wa-core-figure { animation-name: wa-core; animation-duration: 2.35s; }
        .wa-cardio-figure { animation-name: wa-cardio; animation-duration: 1.2s; }
        .wa-mobility-figure { animation-name: wa-mobility; animation-duration: 2.35s; }
        .wa-strength-figure { animation-name: wa-strength; animation-duration: 1.65s; }
        .wa-head { fill: color-mix(in srgb, var(--wa-accent) 18%, white); stroke: color-mix(in srgb, var(--wa-accent) 70%, black); stroke-width: 2; }
        .wa-torso-fill { fill: var(--wa-accent); filter: drop-shadow(0 12px 18px rgba(15, 23, 42, .18)); }
        .wa-body-wide { fill: none; stroke: var(--wa-accent); stroke-width: 23; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 12px 18px rgba(15, 23, 42, .16)); }
        .wa-limb-main, .wa-limb-soft, .wa-leg-main, .wa-leg-soft { fill: none; stroke-linecap: round; stroke-linejoin: round; }
        .wa-limb-main, .wa-limb-soft { stroke-width: 12; }
        .wa-leg-main, .wa-leg-soft { stroke-width: 13; }
        .wa-limb-main, .wa-leg-main { stroke: color-mix(in srgb, var(--wa-accent) 76%, white); }
        .wa-limb-soft, .wa-leg-soft { stroke: color-mix(in srgb, var(--wa-accent) 54%, white); opacity: .78; }
        .wa-floor-line { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; opacity: .14; }
        .wa-shadow { fill: var(--wa-soft); transform-box: fill-box; transform-origin: center; animation: wa-shadow 1.8s ease-in-out infinite; }
        .wa-bar, .wa-weight-bar { fill: none; stroke: currentColor; stroke-width: 7; stroke-linecap: round; opacity: .62; }
        .wa-weight { fill: color-mix(in srgb, var(--wa-accent) 18%, transparent); stroke: var(--wa-accent); stroke-width: 2; }
        .wa-motion-line, .wa-arc { fill: none; stroke: var(--wa-accent); stroke-width: 5; stroke-linecap: round; opacity: .55; stroke-dasharray: 18 14; animation: wa-motion 1.6s ease-in-out infinite; }
        .wa-delay { animation-delay: .35s; }
        .wa-rest-rings circle { transform-box: fill-box; transform-origin: center; fill: none; stroke: var(--wa-accent); stroke-width: 4; animation: wa-breathe 2.9s ease-in-out infinite; }
        .wa-rest-rings circle:nth-child(2) { animation-delay: .2s; opacity: .5; }
        .wa-rest-rings circle:nth-child(3) { fill: var(--wa-accent); stroke-width: 0; animation-delay: .35s; }
      `}</style>

      <div className="wa-stage">
        <Illustration />
        <div className="absolute bottom-3 left-3 rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold shadow-sm">
          {c.label}
        </div>
      </div>
    </div>
  );
}
