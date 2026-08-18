import { useMemo, useRef, useState } from "react";
import {
  Brain,
  CATEGORIES,
  catColor,
  radiusOf,
  seedBrain,
  type BrainView,
  type GraphNode,
} from "./brain";

const WORLD_W = 1000;
const WORLD_H = 1700;

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2 - (dy / d) * d * 0.14;
  const my = (y1 + y2) / 2 + (dx / d) * d * 0.14;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function Graph({
  view,
  focus,
  onPick,
}: {
  view: BrainView;
  focus: string;
  onPick: (id: string) => void;
}) {
  const [cam, setCam] = useState({ x: 0, y: 200, w: 1000 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const neighbors = new Set<string>();
  if (focus) {
    neighbors.add(focus);
    for (const l of view.links) {
      if (l.source === focus) neighbors.add(l.target);
      if (l.target === focus) neighbors.add(l.source);
    }
  }
  const vh = (cam.w * WORLD_H) / WORLD_W;

  return (
    <svg
      className="graph-svg"
      viewBox={`${cam.x} ${cam.y} ${cam.w} ${vh}`}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const scale = cam.w / rect.width;
        setCam({
          ...cam,
          x: drag.current.cx - (e.clientX - drag.current.x) * scale,
          y: drag.current.cy - (e.clientY - drag.current.y) * scale,
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onWheel={(e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        const w = Math.min(2200, Math.max(320, cam.w * factor));
        setCam({ ...cam, w });
      }}
    >
      {view.links.map((l, i) => {
        const a = view.nodes.find((n) => n.id === l.source);
        const b = view.nodes.find((n) => n.id === l.target);
        if (!a || !b) return null;
        const dim = focus && !neighbors.has(l.source) && !neighbors.has(l.target);
        return (
          <path
            key={i}
            className={`glink${l.kind === "builds" ? " builds" : ""}`}
            d={edgePath(a.x, a.y, b.x, b.y)}
            fill="none"
            strokeWidth={l.kind === "builds" ? 2.2 : 1.6}
            strokeOpacity={dim ? 0.08 : 0.25 + l.weight * 0.55}
            pathLength={1}
          />
        );
      })}
      {view.nodes.map((node, index) => (
        <NodeMark
          key={node.id}
          node={node}
          index={index}
          mastery={view.skills.find((s) => s.id === node.id)?.mastery ?? 0}
          dim={Boolean(focus) && !neighbors.has(node.id)}
          lit={focus === node.id}
          onPick={onPick}
        />
      ))}
    </svg>
  );
}

function NodeMark({
  node,
  index,
  mastery,
  dim,
  lit,
  onPick,
}: {
  node: GraphNode;
  index: number;
  mastery: number;
  dim: boolean;
  lit: boolean;
  onPick: (id: string) => void;
}) {
  const skill = node.kind === "skill";
  const color = skill ? "#c9d1ff" : catColor(node.category);
  const r = radiusOf(node);
  const ringR = r + 8;
  const circ = 2 * Math.PI * ringR;
  const delay = Math.min(index * 30, 600);
  let klass = "gnode";
  if (dim) klass += " dim";
  if (lit) klass += " lit";
  return (
    <g className={klass} style={{ animationDelay: `${delay}ms` }} onClick={() => onPick(node.id)}>
      {lit && <circle className="gnode-glow" cx={node.x} cy={node.y} r={r * 2.4} fill={color} />}
      {skill && (
        <>
          <circle cx={node.x} cy={node.y} r={ringR} fill="none" stroke="#2b2e3d" strokeWidth={3} />
          <circle
            className="gnode-ring"
            cx={node.x}
            cy={node.y}
            r={ringR}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${circ * mastery} ${circ}`}
            transform={`rotate(-90 ${node.x} ${node.y})`}
          />
        </>
      )}
      <circle
        className={`gnode-core${skill ? " skill" : ""}`}
        cx={node.x}
        cy={node.y}
        r={r}
        fill={skill ? "#171a2e" : color}
        stroke={color}
        strokeWidth={skill ? 3 : 0}
      />
      <text
        className={`glabel${skill ? " skill" : ""}`}
        x={node.x}
        y={node.y + (skill ? ringR : r) + 26}
        textAnchor="middle"
        fill={color}
      >
        {node.label.length > 22 ? node.label.slice(0, 21) + "…" : node.label}
      </text>
    </g>
  );
}

export function App() {
  const brainRef = useRef<Brain | null>(null);
  if (!brainRef.current) {
    brainRef.current = seedBrain();
  }
  const [tick, setTick] = useState(0);
  const [focus, setFocus] = useState("");
  const [text, setText] = useState("");
  const [cat, setCat] = useState("");
  const [story, setStory] = useState("");
  const [tab, setTab] = useState("brain");
  const view = useMemo(() => brainRef.current!.view(), [tick]);

  const thoughts = view.nodes.filter((n) => n.kind === "thought");
  const focused = view.nodes.find((n) => n.id === focus);

  function submit() {
    const result = brainRef.current!.add(text, cat);
    if (!result) return;
    setText("");
    setFocus(result.id);
    setTab("brain");
    let line = `Filed as ${result.category}`;
    if (result.related) line += ` · linked to ${result.related} thought${result.related === 1 ? "" : "s"}`;
    if (result.fed.length) line += ` · feeds ${result.fed.join(", ")}`;
    setStory(line);
    setTick((n) => n + 1);
  }

  const related: string[] = [];
  const skillsFed: string[] = [];
  if (focus) {
    const labels: Record<string, string> = {};
    for (const n of view.nodes) labels[n.id] = n.label;
    for (const l of view.links) {
      const other = l.source === focus ? l.target : l.target === focus ? l.source : "";
      if (!other || !(other in labels)) continue;
      if (l.kind === "builds") {
        if (l.source === focus) skillsFed.push(labels[l.target]);
        else related.push(`${labels[other]} · feeds this skill`);
      } else {
        related.push(`${labels[other]} · ${Math.round(l.weight * 100)}% · ${l.reason}`);
      }
    }
  }

  return (
    <div className={`shell tab-${tab}`}>
      <header className="header">
        <span className="logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9">
            <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 9 18a3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 2-4.8A3 3 0 0 0 15 8a3 3 0 0 0-3-3Z" />
            <path d="M12 5v14" />
          </svg>
        </span>
        <span>
          <h1 className="brand-name">Trace</h1>
          <p className="brand-tag">Thoughts become a living graph</p>
        </span>
        <span className="engine-chip">browser demo · no install</span>
      </header>

      <main className="stage">
        <div className="graph-wrap">
          <Graph
            view={view}
            focus={focus}
            onPick={(id) => setFocus(id === focus ? "" : id)}
          />
          <div className="count-pill">
            <b>{thoughts.length}</b> thoughts · <b>{view.skills.length}</b> skills
          </div>
        </div>

        <aside className="dock">
          {tab === "brain" && (
            <div className="dock-brain">
              <div className="sheet embedded">
                <h3>What's on your mind?</h3>
                <textarea
                  className="composer-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="I've been learning about AI agents and how they change software development."
                />
                <div className="cat-strip">
                  <button
                    className={`cat-pick${cat === "" ? " on" : ""}`}
                    onClick={() => setCat("")}
                  >
                    Auto
                  </button>
                  {CATEGORIES.map((name) => (
                    <button
                      key={name}
                      className={`cat-pick${cat === name ? " on" : ""}`}
                      style={{
                        borderColor: cat === name ? catColor(name) : "#262833",
                        color: cat === name ? catColor(name) : "#9a9eb0",
                      }}
                      onClick={() => setCat(cat === name ? "" : name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button className="primary-btn" disabled={!text.trim()} onClick={submit}>
                  Add to brain
                </button>
                <p className="hint">Auto-categorised and linked. ⌘↵ to submit.</p>
              </div>
              {story && <div className="capture-story">{story}</div>}
              {focused ? (
                <div className="node-sheet docked">
                  <div className="node-sheet-top">
                    <span className="node-kind" style={{ color: focused.kind === "skill" ? "#c9d1ff" : catColor(focused.category) }}>
                      {focused.kind === "skill" ? "Skill" : focused.category}
                    </span>
                    <button className="node-close" onClick={() => setFocus("")}>
                      ×
                    </button>
                  </div>
                  <p className="node-text">{focused.detail}</p>
                  {skillsFed.length > 0 && (
                    <div className="inspect-block">
                      <p className="inspect-label">Feeds</p>
                      <div className="node-neighbors">
                        {skillsFed.map((s) => (
                          <span key={s} className="build-tag">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {related.length > 0 && (
                    <div className="inspect-block">
                      <p className="inspect-label">Why it linked</p>
                      <ul className="inspect-list">
                        {related.map((row, i) => (
                          <li key={i}>{row}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="dock-guide">
                  <p className="section-title">Tap a node</p>
                  <p className="dock-copy">
                    Relatedness is a weighted Link edge — shared skills first, word overlap to break ties, capped at three neighbours.
                  </p>
                  <p className="section-title">Skills forming</p>
                  {view.skills.slice(0, 3).map((s) => (
                    <div key={s.id} className="dock-skill">
                      <span className="skill-name">{s.name}</span>
                      <span className="card-meta">
                        {s.reps}/{s.target}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "skills" && (
            <div className="scroll">
              <p className="section-title">Skills forming</p>
              {view.skills.map((s) => (
                <article key={s.id} className="card">
                  <div className="card-top">
                    <span className="skill-name">{s.name}</span>
                    <span className="card-meta">{Math.round(s.mastery * 100)}%</span>
                  </div>
                  <p className="card-links">{s.blurb}</p>
                  <div className="bar-track">
                    <span className="bar-fill" style={{ width: `${s.mastery * 100}%`, background: "#6d7cfa" }} />
                  </div>
                  <p className="card-links">
                    {s.reps} of {s.target} thoughts feeding it
                  </p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </main>

      <nav className="tabbar" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <button className={`tab${tab === "brain" ? " on" : ""}`} onClick={() => setTab("brain")}>
          Brain
        </button>
        <button className="fab" onClick={() => setTab("brain")} aria-label="New thought">
          +
        </button>
        <button className={`tab${tab === "skills" ? " on" : ""}`} onClick={() => setTab("skills")}>
          Skills
        </button>
      </nav>
    </div>
  );
}
