import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Brain,
  CATEGORIES,
  SAMPLE_THOUGHT,
  catColor,
  curiosity,
  goalStats,
  radiusOf,
  seedBrain,
  type BrainView,
  type CuriosityItem,
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

function shortDate(iso: string) {
  if (iso.length < 16) return "";
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}

function Graph({
  view,
  focus,
  freshId,
  hidden,
  onPick,
  onClear,
}: {
  view: BrainView;
  focus: string;
  freshId: string;
  hidden: string[];
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 200, w: 1000 });
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: number; bg: boolean } | null>(null);
  const lastMoved = useRef(0);
  const prevFocus = useRef("");
  const visible = view.nodes.filter((n) => n.kind === "skill" || !hidden.includes(n.category));
  const at = new Map(visible.map((n) => [n.id, n]));
  const focused = at.get(focus);
  const neighbors = new Set<string>();
  if (focus) {
    neighbors.add(focus);
    for (const l of view.links) {
      const skillFocus = focused?.kind === "skill";
      if (skillFocus && l.kind !== "builds") continue;
      if (l.source === focus) neighbors.add(l.target);
      if (l.target === focus) neighbors.add(l.source);
    }
  }
  const vh = (cam.w * WORLD_H) / WORLD_W;

  useEffect(() => {
    if (!focus || focus === prevFocus.current) {
      prevFocus.current = focus;
      return;
    }
    prevFocus.current = focus;
    const node = at.get(focus);
    if (!node) return;
    const start = cam;
    const width = start.w;
    const height = (width * WORLD_H) / WORLD_W;
    const endX = node.x - width / 2;
    const endY = node.y - height / 2;
    const t0 = performance.now();
    let raf = 0;
    const tickCam = (now: number) => {
      const t = Math.min(1, (now - t0) / 420);
      const ease = 1 - (1 - t) * (1 - t);
      setCam({
        x: start.x + (endX - start.x) * ease,
        y: start.y + (endY - start.y) * ease,
        w: width,
      });
      if (t < 1) raf = requestAnimationFrame(tickCam);
    };
    raf = requestAnimationFrame(tickCam);
    return () => cancelAnimationFrame(raf);
    // Glide only when the focused node changes; pan/zoom stay user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="graph-stage" ref={wrap}>
      <svg
        className="graph-svg"
        viewBox={`${cam.x} ${cam.y} ${cam.w} ${vh}`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const bg = (e.target as Element).classList.contains("graph-svg");
          drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: 0, bg };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const scale = cam.w / rect.width;
          drag.current.moved += Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y);
          setCam({
            ...cam,
            x: drag.current.cx - (e.clientX - drag.current.x) * scale,
            y: drag.current.cy - (e.clientY - drag.current.y) * scale,
          });
        }}
        onPointerUp={() => {
          const g = drag.current;
          lastMoved.current = g?.moved ?? 0;
          drag.current = null;
          if (g && g.bg && g.moved < 8) onClear();
        }}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY > 0 ? 1.08 : 0.92;
          const w = Math.min(2200, Math.max(320, cam.w * factor));
          setCam({ ...cam, w });
        }}
      >
        {view.links.map((l, i) => {
          const a = at.get(l.source);
          const b = at.get(l.target);
          if (!a || !b) return null;
          const hot = Boolean(focus) && neighbors.has(l.source) && neighbors.has(l.target);
          const dim = Boolean(focus) && !hot;
          return (
            <path
              key={i}
              className={`glink${l.kind === "builds" ? " builds" : ""}${hot ? " hot" : ""}`}
              d={edgePath(a.x, a.y, b.x, b.y)}
              fill="none"
              strokeWidth={hot ? (l.kind === "builds" ? 2.8 : 2) : l.kind === "builds" ? 2.2 : 1.6}
              strokeOpacity={dim ? 0.06 : hot ? 0.85 : 0.22 + l.weight * 0.5}
              pathLength={1}
            />
          );
        })}
        {visible.map((node, index) => (
          <NodeMark
            key={node.id}
            node={node}
            index={index}
            mastery={view.skills.find((s) => s.id === node.id)?.mastery ?? 0}
            dim={Boolean(focus) && !neighbors.has(node.id)}
            lit={neighbors.has(node.id)}
            selected={focus === node.id}
            fresh={freshId === node.id}
            onPick={(id) => {
              if (lastMoved.current >= 8) return;
              onPick(id);
            }}
            onTip={(text, clientX, clientY) => {
              const box = wrap.current?.getBoundingClientRect();
              if (!box) return;
              setTip({ text, x: clientX - box.left, y: clientY - box.top });
            }}
            onTipOut={() => setTip(null)}
          />
        ))}
      </svg>
      {tip && (
        <div className="graph-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

function NodeMark({
  node,
  index,
  mastery,
  dim,
  lit,
  selected,
  fresh,
  onPick,
  onTip,
  onTipOut,
}: {
  node: GraphNode;
  index: number;
  mastery: number;
  dim: boolean;
  lit: boolean;
  selected: boolean;
  fresh: boolean;
  onPick: (id: string) => void;
  onTip: (text: string, x: number, y: number) => void;
  onTipOut: () => void;
}) {
  const skill = node.kind === "skill";
  const color = skill ? "#c9d1ff" : catColor(node.category);
  const r = radiusOf(node);
  const ringR = r + 8;
  const circ = 2 * Math.PI * ringR;
  const delay = Math.min(index * 30, 600);
  let klass = "gnode";
  if (dim) klass += " dim";
  if (selected) klass += " lit";
  if (lit && !selected) klass += " near";
  if (fresh) klass += " fresh";
  const showLabel = skill || selected || (lit && node.kind === "thought");
  return (
    <g
      className={klass}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onPick(node.id)}
      onPointerEnter={(e) => {
        if (!skill) onTip(node.detail, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!skill) onTip(node.detail, e.clientX, e.clientY);
      }}
      onPointerLeave={onTipOut}
    >
      {(selected || fresh) && <circle className="gnode-glow" cx={node.x} cy={node.y} r={r * 2.4} fill={color} />}
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
      {showLabel && (
        <text
          className={`glabel${skill ? " skill" : ""}`}
          x={node.x}
          y={node.y + (skill ? ringR : r) + 22}
          textAnchor="middle"
          fill={color}
        >
          {skill
            ? node.label
            : node.label.length > 18
              ? node.label.slice(0, 17) + "…"
              : node.label}
        </text>
      )}
    </g>
  );
}

function CategoryLegend({
  hidden,
  open,
  onToggle,
  onExpand,
}: {
  hidden: string[];
  open: boolean;
  onToggle: (name: string) => void;
  onExpand: () => void;
}) {
  return (
    <div className={open ? "legend" : "legend closed"}>
      <button className="legend-head" onClick={onExpand}>
        <span className="legend-title">Categories</span>
        <span className="legend-caret">{open ? "–" : "+"}</span>
      </button>
      {open
        ? CATEGORIES.map((name) => (
            <button
              key={name}
              className={hidden.includes(name) ? "legend-row off" : "legend-row"}
              onClick={() => onToggle(name)}
            >
              <span className="legend-swatch" style={{ background: catColor(name) }} />
              <span style={{ textTransform: "capitalize" }}>{name}</span>
            </button>
          ))
        : (
          <div className="legend-dots">
            {CATEGORIES.map((name) => (
              <button
                key={name}
                className={hidden.includes(name) ? "legend-dot off" : "legend-dot"}
                style={{ background: catColor(name) }}
                onClick={() => onToggle(name)}
                aria-label={name}
              />
            ))}
          </div>
        )}
    </div>
  );
}

function Composer({
  text,
  cat,
  embedded,
  linking,
  onText,
  onCat,
  onSubmit,
  onClose,
}: {
  text: string;
  cat: string;
  embedded: boolean;
  linking: boolean;
  onText: (value: string) => void;
  onCat: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className={embedded ? "composer-root" : "composer-overlay-inner"}>
      {!embedded && <div className="backdrop" onClick={onClose} />}
      <div className={embedded ? "sheet embedded" : "sheet"}>
        {!embedded && <div className="grabber" />}
        <h3>{embedded ? "Add a thought" : "New thought"}</h3>
        <textarea
          className="composer-input"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          placeholder={SAMPLE_THOUGHT}
          autoFocus={!embedded}
          disabled={linking}
        />
        <div className="cat-strip">
          <button className={`cat-pick${cat === "" ? " on" : ""}`} onClick={() => onCat("")}>
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
              onClick={() => onCat(cat === name ? "" : name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button className="primary-btn" disabled={linking || !text.trim()} onClick={onSubmit}>
          {linking ? "Connecting…" : "+ Add thought"}
        </button>
        {!text.trim() && !linking && (
          <button type="button" className="example-link" onClick={() => onText(SAMPLE_THOUGHT)}>
            Try: I struggled to explain my project without looking at my slides.
          </button>
        )}
        <p className="hint">
          {linking
            ? "Filing this thought and linking it by shared skills — not a chatbot call."
            : cat === ""
              ? "Trace files it, links related memories, and updates skills. ⌘↵ to submit."
              : `Filed under ${cat}, still auto-linked.`}
        </p>
      </div>
    </div>
  );
}

function Tab({
  name,
  label,
  active,
  icon,
  onSelect,
}: {
  name: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  onSelect: (name: string) => void;
}) {
  return (
    <button className={active ? "tab on" : "tab"} onClick={() => onSelect(name)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const ICONS = {
  brain: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 9 18a3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 2-4.8A3 3 0 0 0 15 8a3 3 0 0 0-3-3Z" />
      <path d="M12 5v14" />
    </svg>
  ),
  feed: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="4" width="7" height="7" rx="2" />
      <path d="M14 6h7M14 10h7M3 16h7M14 16h7M3 20h7M14 20h7" />
    </svg>
  ),
  skills: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.8L18.7 9.7l-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9L12 3Z" />
      <path d="M19 15l.9 2.2 2.1.8-2.1.8-.9 2.2-.9-2.2-2.1-.8 2.1-.8.9-2.2Z" />
    </svg>
  ),
  me: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
};

function Feed({
  view,
  onDelete,
}: {
  view: BrainView;
  onDelete: (id: string) => void;
}) {
  const labels: Record<string, string> = {};
  for (const n of view.nodes) labels[n.id] = n.label;
  const peers: Record<string, number> = {};
  const builds: Record<string, string[]> = {};
  for (const l of view.links) {
    if (l.kind === "builds") {
      const name = labels[l.target] ?? "";
      builds[l.source] = builds[l.source] ? [...builds[l.source], name] : [name];
    } else {
      peers[l.source] = (peers[l.source] ?? 0) + 1;
      peers[l.target] = (peers[l.target] ?? 0) + 1;
    }
  }
  const thoughts = view.nodes.filter((n) => n.kind === "thought").slice().reverse();

  return (
    <div className="scroll">
      <p className="section-title">{thoughts.length} thoughts</p>
      {thoughts.length === 0 && <p className="card-links">Nothing captured yet.</p>}
      {thoughts.map((item, index) => {
        const tint = catColor(item.category);
        const fed = builds[item.id] ?? [];
        const linked = peers[item.id] ?? 0;
        return (
          <article key={item.id} className="card enter" style={{ animationDelay: `${Math.min(index * 45, 450)}ms` }}>
            <div className="card-top">
              <span className="chip" style={{ background: `${tint}26`, color: tint }}>
                {item.category}
              </span>
              <span className="card-meta">{shortDate(item.createdAt)}</span>
              <button className="card-del" onClick={() => onDelete(item.id)}>
                Forget
              </button>
            </div>
            <p className="card-text">{item.detail}</p>
            {fed.length > 0 && (
              <div className="build-strip">
                {fed.map((name) => (
                  <span key={name} className="build-tag">
                    {name}
                  </span>
                ))}
              </div>
            )}
            {linked > 0 && (
              <p className="card-links">
                Linked to {linked} {linked === 1 ? "thought" : "thoughts"}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Skills({ view }: { view: BrainView }) {
  const thoughts = view.nodes.filter((n) => n.kind === "thought");
  const counts: Record<string, number> = {};
  for (const t of thoughts) counts[t.category] = (counts[t.category] ?? 0) + 1;
  const seen = new Set<string>();
  for (const l of view.links) {
    if (l.kind === "link") {
      seen.add(l.source);
      seen.add(l.target);
    }
  }
  const total = thoughts.length;
  const connected = thoughts.filter((t) => seen.has(t.id)).length;

  return (
    <div className="scroll">
      <p className="section-title">Skills forming</p>
      {view.skills.length === 0 && (
        <p className="card-links">Capture a few thoughts and skills will emerge here.</p>
      )}
      {view.skills.map((s) => {
        return (
          <article key={s.id} className="card">
            <div className="card-top">
              <span className="skill-name">{s.name}</span>
              <span className="card-meta">{s.reps} connected</span>
            </div>
            <p className="card-links" style={{ margin: "0 0 10px" }}>
              {s.blurb}
            </p>
            <div className="bar-track">
              <span className="bar-fill" style={{ width: `${s.mastery * 100}%`, background: "#6d7cfa" }} />
            </div>
            <p className="card-links">
              {s.reps} connected thought{s.reps === 1 ? "" : "s"}
            </p>
          </article>
        );
      })}

      <p className="goal-note" style={{ margin: "0 2px 16px" }}>
        Counted from linked thoughts — not a measured score.
      </p>

      <p className="section-title">Memory mix</p>
      {CATEGORIES.map((name) => {
        const count = counts[name] ?? 0;
        const pct = total === 0 ? 0 : (count / total) * 100;
        return (
          <div key={name} className="bar-row">
            <span className="bar-name">{name}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${pct}%`, background: catColor(name) }} />
            </span>
            <span className="bar-val">{count}</span>
          </div>
        );
      })}

      <p className="section-title">Graph shape</p>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">{total}</div>
          <div className="stat-lbl">Thoughts</div>
        </div>
        <div className="stat">
          <div className="stat-num">{view.links.length}</div>
          <div className="stat-lbl">Connections</div>
        </div>
        <div className="stat">
          <div className="stat-num">{view.skills.length}</div>
          <div className="stat-lbl">Skills</div>
        </div>
        <div className="stat">
          <div className="stat-num">{total - connected}</div>
          <div className="stat-lbl">Unlinked</div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="backdrop" onClick={onCancel} />
      <div className="confirm-card" role="alertdialog" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-go" onClick={onConfirm}>
            {action}
          </button>
        </div>
      </div>
    </>
  );
}

function GoalCard({
  memories,
  skills,
  target,
  ratio,
  active,
  onOpen,
}: {
  memories: number;
  skills: number;
  target: number;
  ratio: number;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={active ? "goal-card on" : "goal-card"} onClick={onOpen}>
      <p className="goal-kicker">Current goal</p>
      <p className="goal-title">Become a stronger public speaker</p>
      <span className="bar-track goal-bar">
        <span className="bar-fill" style={{ width: `${ratio * 100}%`, background: "#cfa356" }} />
      </span>
      <p className="goal-meta">
        {memories} of {target} connected memories · {skills} skill
      </p>
      <p className="goal-note">Counted from linked thoughts — not a measured score.</p>
    </button>
  );
}

function CuriosityList({
  items,
  activeId,
  onPick,
}: {
  items: CuriosityItem[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="curiosity">
      <p className="section-title">Explore your curiosity</p>
      <p className="dock-copy">Tap a path to light the skill and the thoughts that feed it.</p>
      {items.map((item) => (
        <button
          key={item.id}
          className={`curiosity-row${activeId === item.id ? " on" : ""}`}
          onClick={() => onPick(item.id)}
        >
          <span className="curiosity-title">{item.title}</span>
          <span className="curiosity-why">{item.why}</span>
        </button>
      ))}
    </div>
  );
}

function Inspector({
  focused,
  view,
  onJump,
  onClose,
  docked,
}: {
  focused: GraphNode;
  view: BrainView;
  onJump: (id: string) => void;
  onClose: () => void;
  docked: boolean;
}) {
  const thoughts: { id: string; label: string }[] = [];
  const skills: { id: string; label: string }[] = [];
  const why: string[] = [];
  const labels: Record<string, string> = {};
  const kinds: Record<string, string> = {};
  for (const n of view.nodes) {
    labels[n.id] = n.label;
    kinds[n.id] = n.kind;
  }
  for (const l of view.links) {
    const other = l.source === focused.id ? l.target : l.target === focused.id ? l.source : "";
    if (!other || !(other in labels)) continue;
    if (l.kind === "builds") {
      if (focused.kind === "skill") thoughts.push({ id: other, label: labels[other] });
      else if (l.source === focused.id) skills.push({ id: l.target, label: labels[l.target] });
      else thoughts.push({ id: other, label: `${labels[other]} · feeds this skill` });
    } else {
      thoughts.push({ id: other, label: labels[other] });
      why.push(`${labels[other]} · ${Math.round(l.weight * 100)}% · ${l.reason}`);
    }
  }
  const skillCount = focused.kind === "skill"
    ? view.skills.filter((s) => s.id !== focused.id && thoughts.some((t) =>
        view.links.some((l) => l.kind === "builds" && l.source === t.id && l.target === s.id)
      )).length
    : skills.length;

  return (
    <div className={docked ? "node-sheet docked" : "node-sheet"}>
      <div className="node-sheet-top">
        <span className="node-kind" style={{ color: focused.kind === "skill" ? "#c9d1ff" : catColor(focused.category) }}>
          {focused.kind === "skill" ? "Skill" : focused.category}
        </span>
        <button className="node-close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="node-text">{focused.detail}</p>
      <div className="inspect-stats">
        <div>
          <b>{thoughts.length}</b>
          <span>connected thoughts</span>
        </div>
        <div>
          <b>{skillCount}</b>
          <span>related skills</span>
        </div>
      </div>
      {thoughts.length > 0 && (
        <div className="inspect-block">
          <p className="inspect-label">Connected thoughts</p>
          <div className="node-neighbors">
            {thoughts.slice(0, 6).map((t) => (
              <button key={t.id} className="build-tag" onClick={() => onJump(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {skills.length > 0 && (
        <div className="inspect-block">
          <p className="inspect-label">Related skills</p>
          <div className="node-neighbors">
            {skills.map((s) => (
              <button key={s.id} className="build-tag" onClick={() => onJump(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {why.length > 0 && focused.kind === "thought" && (
        <div className="inspect-block">
          <p className="inspect-label">Why it linked</p>
          <ul className="inspect-list">
            {why.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AboutDrawer({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="about-card" role="dialog" aria-label="About Trace">
        <div className="node-sheet-top">
          <p className="section-title" style={{ margin: 0 }}>About Trace</p>
          <button className="node-close" onClick={onClose}>×</button>
        </div>
        <h3 className="about-thesis">The second brain that remembers how you remember.</h3>
        <p className="card-text">
          Trace turns thoughts into a living knowledge graph, connecting memories, skills, and goals to help you see patterns in how you learn — and where curiosity could lead next.
        </p>
        <p className="card-text">
          Inspired by knowledge graphs, Obsidian-style connected notes, and curiosity mapping: ideas get more useful when the relationships between them are visible. The “brain” language is a product metaphor, not a claim about neural activity.
        </p>
        <p className="inspect-label">Built with</p>
        <p className="card-links">React · TypeScript · Vite · Jac/Jaseci</p>
        <p className="inspect-label">Engineering</p>
        <ul className="inspect-list">
          <li>Custom graph visualization engine — no vis.js / D3</li>
          <li>Force-directed layout</li>
          <li>Pan, zoom, and glide-to-node</li>
          <li>Jac app: optimistic submit with rollback</li>
        </ul>
        <p className="inspect-label">How it was built</p>
        <p className="card-text">
          I directed Devin, an AI coding agent, against a written spec rather than using it as autocomplete. Architecture, constraints, and validation stayed with the human developer.
        </p>
        <a className="about-github" href="https://github.com/amberkaurtoor-09/Trace" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </>
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
  const [hidden, setHidden] = useState<string[]>([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [freshId, setFreshId] = useState("");
  const [about, setAbout] = useState(false);
  const [pendingDelete, setPendingDelete] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const view = useMemo(() => brainRef.current!.view(), [tick]);
  const goal = goalStats(view);
  const nextPaths = curiosity(view);

  const thoughts = view.nodes.filter((n) => n.kind === "thought");
  const visible = thoughts.filter((n) => !hidden.includes(n.category));
  const focused = view.nodes.find((n) => n.id === focus);

  function pick(id: string) {
    setFocus((current) => (current === id ? "" : id));
    setTab("brain");
  }

  function submit() {
    if (linking || !text.trim()) return;
    const pending = text;
    const pendingCat = cat;
    setLinking(true);
    window.setTimeout(() => {
      const result = brainRef.current!.add(pending, pendingCat);
      setLinking(false);
      if (!result) return;
      setText("");
      setFocus(result.id);
      setFreshId(result.id);
      setTab("brain");
      setComposing(false);
      const bits = [`Filed as ${result.category}`];
      if (result.related) bits.push(`${result.related} new connection${result.related === 1 ? "" : "s"}`);
      if (result.fed.length) bits.push(`skill path: ${result.fed.join(", ")}`);
      setStory(bits.join(" · "));
      setTick((n) => n + 1);
    }, 650);
  }

  function choose(name: string) {
    setTab(name);
    setFocus("");
  }

  function toggleCategory(name: string) {
    setHidden((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  const composer = (
    <Composer
      text={text}
      cat={cat}
      embedded
      linking={linking}
      onText={setText}
      onCat={setCat}
      onSubmit={submit}
      onClose={() => setComposing(false)}
    />
  );

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
        <button className="engine-chip about-chip" onClick={() => setAbout(true)}>
          About Trace
        </button>
      </header>

      <main className="stage">
        <div className="graph-wrap">
          <Graph
            view={view}
            focus={focus}
            freshId={freshId}
            hidden={hidden}
            onPick={pick}
            onClear={() => setFocus("")}
          />
          {!focused && (
          <div className="home-stack">
            <GoalCard
              memories={goal.memories}
              skills={goal.skills}
              target={goal.target}
              ratio={goal.ratio}
              active={focus === goal.skillId}
              onOpen={() => {
                if (goal.skillId) {
                  setFocus(goal.skillId);
                  setTab("brain");
                }
              }}
            />
            <CuriosityList
              items={nextPaths}
              activeId={focus}
              onPick={(id) => {
                setFocus(id);
                setTab("brain");
              }}
            />
          </div>
          )}
          {thoughts.length > 0 && (
            <>
              <CategoryLegend
                hidden={hidden}
                open={legendOpen}
                onToggle={toggleCategory}
                onExpand={() => setLegendOpen((open) => !open)}
              />
              <div className="count-pill">
                <b>{visible.length}</b> thoughts · <b>{view.skills.length}</b> skills
              </div>
            </>
          )}
          {linking && <div className="linking-toast">Connecting this thought to related memories…</div>}
          {focused && (
            <Inspector
              focused={focused}
              view={view}
              docked={false}
              onJump={(id) => setFocus(id)}
              onClose={() => setFocus("")}
            />
          )}
        </div>

        <aside className="dock">
          {tab === "brain" && (
            <div className="dock-brain">
              <GoalCard
                memories={goal.memories}
                skills={goal.skills}
                target={goal.target}
                ratio={goal.ratio}
                active={focus === goal.skillId}
                onOpen={() => {
                if (goal.skillId) {
                  setFocus(goal.skillId);
                  setTab("brain");
                }
              }}
              />
              {composer}
              {story && <div className="capture-story">{story}</div>}
              {focused ? (
                <Inspector
                  focused={focused}
                  view={view}
                  docked
                  onJump={(id) => setFocus(id)}
                  onClose={() => setFocus("")}
                />
              ) : (
                <CuriosityList
                  items={nextPaths}
                  activeId={focus}
                  onPick={(id) => {
                    setFocus(id);
                    setTab("brain");
                  }}
                />
              )}
              <button className="about-link" onClick={() => setAbout(true)}>
                About Trace →
              </button>
            </div>
          )}
          {tab === "feed" && <Feed view={view} onDelete={setPendingDelete} />}
          {tab === "skills" && <Skills view={view} />}
          {tab === "me" && (
            <div className="scroll">
              <p className="section-title">How this was built</p>
              <div className="card">
                <p className="inspect-label">AI-assisted development</p>
                <p className="card-text">
                  I directed Devin, an AI coding agent, against a written engineering specification rather than using it as autocomplete.
                </p>
              </div>
              <p className="section-title">Engineering decisions</p>
              <div className="card">
                <p className="inspect-label">Graph rendering</p>
                <p className="card-text">Hand-rolled graph camera for direct control over pan, zoom, and glide-to-node. No vis.js or D3.</p>
                <p className="inspect-label">Relationship model</p>
                <p className="card-text">Thoughts connect through typed Link edges. Relatedness is 0.65 × shared skills + 0.35 × word overlap, capped at three peers — not raw keyword matching.</p>
                <p className="inspect-label">State handling</p>
                <p className="card-text">The Jac app submits optimistically and rolls back if the server rejects the write. This static demo files and links locally with the same scoring rules.</p>
                <p className="inspect-label">Data model</p>
                <p className="card-text">Thoughts, skills, and relationships are an object-spatial graph: Thought --Link--&gt; Thought, Thought --Builds--&gt; Skill.</p>
                <p className="card-links">
                  {view.nodes.length} nodes · {view.links.length} edges
                </p>
              </div>
              <p className="section-title">Danger zone</p>
              <button className="ghost-btn wide" onClick={() => setConfirmWipe(true)}>
                Erase this brain
              </button>
            </div>
          )}
        </aside>
      </main>

      <nav className="tabbar">
        <Tab name="brain" label="Brain" active={tab === "brain"} icon={ICONS.brain} onSelect={choose} />
        <Tab name="feed" label="Feed" active={tab === "feed"} icon={ICONS.feed} onSelect={choose} />
        <button className="fab" onClick={() => setComposing(true)} aria-label="Add thought">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <Tab name="skills" label="Skills" active={tab === "skills"} icon={ICONS.skills} onSelect={choose} />
        <Tab name="me" label="Me" active={tab === "me"} icon={ICONS.me} onSelect={choose} />
      </nav>

      {composing && (
        <div className="composer-overlay">
          <Composer
            text={text}
            cat={cat}
            embedded={false}
            linking={linking}
            onText={setText}
            onCat={setCat}
            onSubmit={submit}
            onClose={() => setComposing(false)}
          />
        </div>
      )}

      {about && <AboutDrawer onClose={() => setAbout(false)} />}

      {confirmWipe && (
        <ConfirmDialog
          title="Erase this brain?"
          body="Every thought, link and skill will be permanently deleted. This cannot be undone."
          action="Erase everything"
          onConfirm={() => {
            brainRef.current!.wipe();
            setConfirmWipe(false);
            setFocus("");
            setFreshId("");
            setStory("");
            setTick((n) => n + 1);
          }}
          onCancel={() => setConfirmWipe(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Forget this thought?"
          body="The thought and its links will be removed. Skills it fed will lose one rep."
          action="Forget it"
          onConfirm={() => {
            brainRef.current!.remove(pendingDelete);
            if (focus === pendingDelete) setFocus("");
            setPendingDelete("");
            setTick((n) => n + 1);
          }}
          onCancel={() => setPendingDelete("")}
        />
      )}
    </div>
  );
}
