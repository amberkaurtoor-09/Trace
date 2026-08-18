export const CATEGORIES = [
  "idea",
  "memory",
  "goal",
  "learning",
  "health",
  "reflection",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CAT_COLORS: Record<string, string> = {
  idea: "#7d8cf0",
  memory: "#d97ba2",
  goal: "#cfa356",
  learning: "#5cb894",
  health: "#58aec4",
  reflection: "#a488d9",
};

const KEYWORDS: Record<Category, string[]> = {
  goal: ["goal", "want to", "plan to", "by next", "deadline", "ship", "launch", "finish"],
  memory: ["remember", "yesterday", "last week", "back when", "reminded me", "we met"],
  learning: ["learned", "read that", "turns out", "til", "discovered", "figured out"],
  health: ["sleep", "slept", "workout", "run", "ran", "gym", "ate", "tired", "anxious"],
  reflection: ["i feel", "i think", "wonder", "grateful", "realized", "lately"],
  idea: ["what if", "idea", "could build", "concept", "imagine"],
};

type SkillSpec = { name: string; blurb: string; target: number; words: string[] };

const SKILL_SPECS: SkillSpec[] = [
  { name: "Object-Spatial Programming", blurb: "Thinking in nodes, edges and walkers", target: 6, words: ["jac", "walker", "graph", "node", "edge", "spawn", "traversal", "osp"] },
  { name: "Frontend Craft", blurb: "Interfaces that feel considered", target: 6, words: ["react", "css", "layout", "component", "animation", "interface", "responsive", "svg"] },
  { name: "Systems Thinking", blurb: "Seeing the whole, not the parts", target: 5, words: ["architecture", "system", "tradeoff", "scale", "latency", "bottleneck", "coupling"] },
  { name: "Machine Learning", blurb: "Getting useful work out of models", target: 5, words: ["model", "llm", "embedding", "prompt", "inference", "training", "dataset"] },
  { name: "Writing", blurb: "Turning thinking into prose", target: 4, words: ["write", "writing", "wrote", "essay", "draft", "blog", "article", "prose"] },
  { name: "Focus & Recovery", blurb: "Sustaining the engine that does the work", target: 4, words: ["sleep", "slept", "rest", "focus", "tired", "workout", "walk", "burnout", "energy"] },
];

const DEMO: [string, Category][] = [
  ["Walkers finally clicked - the walker moves to the data instead of me querying for it", "learning"],
  ["What if every note in my brain was a node and the edges were computed, not typed by hand", "idea"],
  ["Spent the evening on graph traversal in Jac, visit queues are breadth-first by default", "learning"],
  ["I want to ship a working demo of the second brain before the deadline", "goal"],
  ["Read that spaced repetition works because retrieval is the thing that strengthens memory", "learning"],
  ["Remember the whiteboard session where we drew the whole architecture in one diagram", "memory"],
  ["The React component tree got messy until I moved all state into one shell component", "learning"],
  ["Slept badly again, and the whole morning of debugging was basically wasted", "health"],
  ["Went for a long walk and the layout bug solved itself somewhere around the second mile", "health"],
  ["I feel like I understand systems thinking better when I draw the tradeoff explicitly", "reflection"],
  ["An LLM prompt is really just a very expensive function call, budget it like one", "learning"],
  ["Idea: let the model propose edges between notes and let me approve them", "idea"],
  ["Wrote a draft of the essay about why note apps fail at retrieval", "learning"],
  ["The CSS animation looked cheap until I slowed the easing curve down", "learning"],
  ["Realized lately that I learn architecture fastest by rebuilding something I already know", "reflection"],
  ["Embedding search returned nonsense until I normalized the vectors first", "learning"],
  ["Goal for next month: write one essay a week and actually publish them", "goal"],
  ["We met at the meetup and talked about scale and latency tradeoffs for an hour", "memory"],
];

export type GraphNode = {
  id: string;
  kind: "thought" | "skill";
  label: string;
  detail: string;
  category: string;
  strength: number;
  createdAt: string;
  x: number;
  y: number;
};

export type GraphLink = {
  source: string;
  target: string;
  weight: number;
  kind: "link" | "builds";
  reason: string;
};

export type SkillView = {
  id: string;
  name: string;
  blurb: string;
  reps: number;
  target: number;
  mastery: number;
};

export type BrainView = {
  nodes: GraphNode[];
  links: GraphLink[];
  skills: SkillView[];
};

type Thought = {
  id: string;
  content: string;
  category: Category;
  strength: number;
  skillNames: string[];
  createdAt: string;
};

const CANVAS = 1000;
const CANVAS_H = 1700;

function normalize(text: string) {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
  return ` ${words.join(" ")} `;
}

export function classify(text: string): Category {
  const low = normalize(text);
  for (const [cat, words] of Object.entries(KEYWORDS) as [Category, string[]][]) {
    if (words.some((w) => low.includes(` ${w} `))) return cat;
  }
  return "idea";
}

function matchSkills(text: string) {
  const low = normalize(text);
  return SKILL_SPECS.filter((spec) => spec.words.some((w) => low.includes(` ${w} `)));
}

function tokens(text: string) {
  const stop = new Set([
    "this", "that", "with", "from", "have", "been", "were", "they",
    "them", "then", "than", "what", "when", "your", "about", "would",
    "could", "should", "there", "their", "which", "into", "just", "like",
  ]);
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/\s+/)) {
    let w = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    if (w.length > 3 && !stop.has(w)) {
      if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);
      out.add(w);
    }
  }
  return out;
}

function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

function slug(name: string) {
  return "skill-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function labelOf(text: string) {
  const words = text.split(/\s+/);
  return words.length > 4 ? words.slice(0, 4).join(" ") : text;
}

function layout(ids: string[], links: GraphLink[]) {
  const pos: Record<string, [number, number]> = {};
  const n = ids.length;
  const center = CANVAS / 2;
  const middle = CANVAS_H / 2;
  if (n === 0) return pos;
  if (n === 1) {
    pos[ids[0]] = [center, middle];
    return pos;
  }
  const spread = CANVAS * 0.34;
  ids.forEach((id, i) => {
    const angle = 2.399963 * i;
    const r = spread * Math.sqrt((i + 1) / n);
    pos[id] = [center + r * Math.cos(angle), middle + r * Math.sin(angle) * 1.5];
  });

  const repel = CANVAS * CANVAS * 0.048;
  const rest = CANVAS * 0.15;
  const margin = CANVAS * 0.07;
  const steps = 120;

  for (let step = 0; step < steps; step++) {
    const cool = 1 - step / steps;
    const push: Record<string, [number, number]> = {};
    for (const id of ids) push[id] = [0, 0];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = ids[i];
        const b = ids[j];
        let dx = pos[a][0] - pos[b][0];
        let dy = pos[a][1] - pos[b][1];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = 1 + i;
          dy = 1 + j;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = repel / d2;
        const ux = dx / d;
        const uy = dy / d;
        push[a][0] += ux * f;
        push[a][1] += uy * f;
        push[b][0] -= ux * f;
        push[b][1] -= uy * f;
      }
    }

    for (const l of links) {
      if (!(l.source in pos) || !(l.target in pos)) continue;
      const dx = pos[l.target][0] - pos[l.source][0];
      const dy = pos[l.target][1] - pos[l.source][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 0.001) continue;
      const f = (d - rest) * (0.6 + l.weight);
      const ux = dx / d;
      const uy = dy / d;
      push[l.source][0] += ux * f;
      push[l.source][1] += uy * f;
      push[l.target][0] -= ux * f;
      push[l.target][1] -= uy * f;
    }

    const cap = CANVAS * 0.05 * cool + 0.5;
    for (const id of ids) {
      let vx = (push[id][0] + (center - pos[id][0]) * 0.03) * 0.016;
      let vy = (push[id][1] + (middle - pos[id][1]) * 0.018) * 0.016;
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > cap) {
        vx = (vx / mag) * cap;
        vy = (vy / mag) * cap;
      }
      pos[id] = [
        Math.max(margin, Math.min(CANVAS - margin, pos[id][0] + vx)),
        Math.max(margin, Math.min(CANVAS_H - margin, pos[id][1] + vy)),
      ];
    }
  }
  return pos;
}

function nodeRadius(kind: "thought" | "skill", strength: number) {
  const capped = Math.min(strength, 8);
  return kind === "skill" ? 24 + capped * 2.6 : 13 + capped * 2.8;
}

export function catColor(name: string) {
  return CAT_COLORS[name] ?? "#7d8cf0";
}

export function radiusOf(node: GraphNode) {
  return nodeRadius(node.kind, node.strength);
}

export class Brain {
  thoughts: Thought[] = [];
  peerEdges: { source: string; target: string; weight: number; reason: string }[] = [];
  seq = 0;

  add(text: string, category: string) {
    const content = text.trim();
    if (!content) return null;
    const cat = (CATEGORIES as readonly string[]).includes(category)
      ? (category as Category)
      : classify(content);
    const mine = matchSkills(content).map((s) => s.name);
    const candidates: { other: Thought; score: number; reason: string }[] = [];

    for (const other of this.thoughts) {
      const theirs = new Set(other.skillNames);
      const smaller = Math.min(mine.length, theirs.size);
      let sharedCount = 0;
      const sharedNames: string[] = [];
      for (const n of mine) {
        if (theirs.has(n)) {
          sharedCount += 1;
          sharedNames.push(n);
        }
      }
      const shared = smaller > 0 ? sharedCount / smaller : 0;
      const lex = similarity(content, other.content);
      const score = 0.65 * shared + 0.35 * lex;
      if (score >= 0.22) {
        let why = "word overlap";
        if (sharedNames.length) {
          why = "shared skill: " + sharedNames.join(", ");
          if (lex >= 0.08) why += " + word overlap";
        }
        candidates.push({ other, score, reason: why });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const id = `t${this.seq++}`;
    const fresh: Thought = {
      id,
      content,
      category: cat,
      strength: 1,
      skillNames: mine,
      createdAt: new Date().toISOString(),
    };
    for (const peer of candidates.slice(0, 3)) {
      this.peerEdges.push({
        source: id,
        target: peer.other.id,
        weight: peer.score,
        reason: peer.reason,
      });
      peer.other.strength += 1;
    }
    this.thoughts.push(fresh);
    return { id, category: cat, related: Math.min(candidates.length, 3), fed: mine };
  }

  seed() {
    for (const [text, cat] of DEMO) this.add(text, cat);
    const now = Date.now();
    this.thoughts.forEach((t, i) => {
      t.createdAt = new Date(now - (this.thoughts.length - 1 - i) * 14 * 3600 * 1000).toISOString();
    });
  }

  remove(id: string) {
    this.thoughts = this.thoughts.filter((t) => t.id !== id);
    this.peerEdges = this.peerEdges.filter((e) => e.source !== id && e.target !== id);
  }

  wipe() {
    this.thoughts = [];
    this.peerEdges = [];
  }

  view(): BrainView {
    const skillIds = new Map<string, SkillSpec>();
    for (const t of this.thoughts) {
      for (const name of t.skillNames) {
        const spec = SKILL_SPECS.find((s) => s.name === name);
        if (spec) skillIds.set(slug(name), spec);
      }
    }

    const links: GraphLink[] = [];
    for (const e of this.peerEdges) {
      links.push({ ...e, kind: "link" });
    }
    const reps: Record<string, number> = {};
    for (const t of this.thoughts) {
      for (const name of t.skillNames) {
        const sid = slug(name);
        reps[sid] = (reps[sid] ?? 0) + 1;
        links.push({
          source: t.id,
          target: sid,
          weight: 1,
          kind: "builds",
          reason: "this thought feeds the skill",
        });
      }
    }

    const ids = [...this.thoughts.map((t) => t.id), ...skillIds.keys()];
    const pos = layout(ids, links);
    const nodes: GraphNode[] = [];
    for (const t of this.thoughts) {
      const p = pos[t.id] ?? [CANVAS / 2, CANVAS_H / 2];
      nodes.push({
        id: t.id,
        kind: "thought",
        label: labelOf(t.content),
        detail: t.content,
        category: t.category,
        strength: t.strength,
        createdAt: t.createdAt,
        x: p[0],
        y: p[1],
      });
    }
    const skills: SkillView[] = [];
    for (const [sid, spec] of skillIds) {
      const p = pos[sid] ?? [CANVAS / 2, CANVAS_H / 2];
      const hits = reps[sid] ?? 0;
      nodes.push({
        id: sid,
        kind: "skill",
        label: spec.name,
        detail: spec.blurb,
        category: "skill",
        strength: hits,
        createdAt: "",
        x: p[0],
        y: p[1],
      });
      skills.push({
        id: sid,
        name: spec.name,
        blurb: spec.blurb,
        reps: hits,
        target: spec.target,
        mastery: Math.min(1, hits / spec.target),
      });
    }
    skills.sort((a, b) => b.mastery - a.mastery);
    return { nodes, links, skills };
  }
}

export function seedBrain() {
  const brain = new Brain();
  brain.seed();
  return brain;
}
