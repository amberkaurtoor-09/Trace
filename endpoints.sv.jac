"""Neurotech - Server-Side Data Layer.

A second brain is literally a graph, so it is stored as one:

    Thought --Link--> Thought     semantic relatedness, weighted
    Thought --Builds--> Skill     this memory contributed to that skill

That second edge is the whole thesis of the app. Notes alone are a pile;
notes wired to skills tell you what you are actually getting better at. A
skill's mastery is not a number the user maintains, it is derived by counting
the thoughts that point at it.

`LoadBrain` is a real walker: it traverses out from root, gathers every node
it enters, lays them out, and reports the assembled view once on the way out.
Creation, deletion and seeding are `def:pub` functions -- they touch the graph
but never traverse it, so per `jac-walker-patterns` they would be "RPC in
walker costume" as walkers.

Everything is `:pub` for now, meaning one shared `root` and no login. Switch
to `:priv` to give every signed-in user their own isolated brain.
"""

import math;
import from datetime { datetime, timedelta }

# Layout space. Portrait to match a phone: a square canvas letterboxes into
# the middle third of the screen and wastes most of it. Keep these in sync
# with the viewBox in components/BrainGraph.cl.jac.
glob CANVAS: float = 1000.0;
glob CANVAS_H: float = 1700.0;

glob CATEGORIES: list[str] = [
    "idea", "memory", "goal", "learning", "health", "reflection"
];

glob KEYWORDS: dict[str, list[str]] = {
    "goal": ["goal", "want to", "plan to", "by next", "deadline", "ship", "launch", "finish"],
    "memory": ["remember", "yesterday", "last week", "back when", "reminded me", "we met"],
    "learning": ["learned", "read that", "turns out", "til", "discovered", "figured out"],
    "health": ["sleep", "slept", "workout", "run", "ran", "gym", "ate", "tired", "anxious"],
    "reflection": ["i feel", "i think", "wonder", "grateful", "realized", "lately"],
    "idea": ["what if", "idea", "could build", "concept", "imagine"]
};

"""The skills a thought can feed, and the words that signal each one.

Ordered: a thought joins every skill it matches, so one memory can push more
than one skill forward - which is exactly how learning actually works.
"""
obj SkillSpec {
    has name: str,
        blurb: str,
        target: int,
        words: list[str];
}

glob SKILLS: list[SkillSpec] = [
    SkillSpec(
        name="Object-Spatial Programming",
        blurb="Thinking in nodes, edges and walkers",
        target=6,
        words=["jac", "walker", "graph", "node", "edge", "spawn", "traversal", "osp"]
    ),
    SkillSpec(
        name="Frontend Craft",
        blurb="Interfaces that feel considered",
        target=6,
        words=["react", "css", "layout", "component", "animation", "interface", "responsive", "svg"]
    ),
    SkillSpec(
        name="Systems Thinking",
        blurb="Seeing the whole, not the parts",
        target=5,
        words=["architecture", "system", "tradeoff", "scale", "latency", "bottleneck", "coupling"]
    ),
    SkillSpec(
        name="Machine Learning",
        blurb="Getting useful work out of models",
        target=5,
        words=["model", "llm", "embedding", "prompt", "inference", "training", "dataset"]
    ),
    SkillSpec(
        name="Writing",
        blurb="Turning thinking into prose",
        target=4,
        words=["write", "writing", "wrote", "essay", "draft", "blog", "article", "prose"]
    ),
    SkillSpec(
        name="Focus & Recovery",
        blurb="Sustaining the engine that does the work",
        target=4,
        words=["sleep", "slept", "rest", "focus", "tired", "workout", "walk", "burnout", "energy"]
    )
];

node Thought {
    has content: str,
        category: str = "idea",
        created_at: str = "",
        strength: int = 1;
}

node Skill {
    has name: str,
        blurb: str = "",
        target: int = 6;
}

edge Link: Thought --> Thought {
    has weight: float = 0.5,
        reason: str = "";
}

edge Builds: Thought --> Skill {
    has weight: float = 1.0;
}

obj GraphNode {
    has id: str,
        kind: str,
        label: str,
        detail: str,
        category: str,
        strength: int,
        created_at: str = "",
        x: float = 0.0,
        y: float = 0.0;
}

obj GraphLink {
    has source: str,
        target: str,
        weight: float,
        kind: str = "link",
        reason: str = "";
}

obj Peer {
    has score: float,
        target: Thought,
        reason: str = "";
}

obj SkillView {
    has id: str,
        name: str,
        blurb: str,
        reps: int,
        target: int,
        mastery: float;
}

obj BrainView {
    has nodes: list[GraphNode] = [],
        links: list[GraphLink] = [],
        skills: list[SkillView] = [];
}

"""Lowercase the text down to space-delimited words, padded on both ends.

Padding lets a keyword be matched on word boundaries with a plain `in`, so
"ate" no longer fires on "gr-ate-ful" the way a raw substring search does.
"""
def normalize(text: str) -> str {
    words: list[str] = [];
    for raw in text.lower().split() {
        w = raw.strip(".,!?;:'\"()[]");
        if w {
            words.append(w);
        }
    }
    return " " + " ".join(words) + " ";
}

"""Assign a category by whole-word keyword match; defaults to 'idea'."""
def classify(text: str) -> str {
    low = normalize(text);
    for (cat, words) in KEYWORDS.items() {
        for w in words {
            if f" {w} " in low {
                return cat;
            }
        }
    }
    return "idea";
}

"""Every skill this thought plausibly moves forward."""
def match_skills(text: str) -> list[SkillSpec] {
    low = normalize(text);
    hits: list[SkillSpec] = [];
    for spec in SKILLS {
        for w in spec.words {
            if f" {w} " in low {
                hits.append(spec);
                break;
            }
        }
    }
    return hits;
}

"""Content words of a thought, used for relatedness scoring."""
def tokens(text: str) -> set[str] {
    stop = {
        "this", "that", "with", "from", "have", "been", "were", "they",
        "them", "then", "than", "what", "when", "your", "about", "would",
        "could", "should", "there", "their", "which", "into", "just", "like"
    };
    out: set[str] = set();
    for raw in text.lower().split() {
        w = raw.strip(".,!?;:'\"()[]");
        if len(w) > 3 and w not in stop {
            # Poor man's stemming. Without it "walker" and "walkers" are
            # unrelated strings, which is the most common false negative.
            out.add(w[:-1] if len(w) > 4 and w.endswith("s") else w);
        }
    }
    return out;
}

"""Relatedness of two thoughts, 0.0 - 1.0.

Overlap coefficient (shared words over the *smaller* vocabulary) rather than
Jaccard. Jaccard divides by the union, so a short thought and a long one score
near zero even when the short one is entirely contained in the long one -
which is the single most common way two real notes relate.
"""
def similarity(a: str, b: str) -> float {
    ta = tokens(a);
    tb = tokens(b);
    if not ta or not tb {
        return 0.0;
    }
    smaller = min(len(ta), len(tb));
    if smaller == 0 {
        return 0.0;
    }
    return len(ta & tb) / smaller;
}

"""Find a skill node by name, creating it on first use."""
def ensure_skill(sname: str, blurb: str, target: int) -> Skill {
    found = [root -->[?:Skill, name == sname]];
    if found {
        return found[0];
    }
    return root ++> Skill(name=sname, blurb=blurb, target=target);
}

"""Attach a thought to the graph: categorize, link to peers, feed skills."""
def wire_thought(text: str, category: str, when: str) -> Thought {
    existing = [root -->[?:Thought]];
    cat = category if category in CATEGORIES else classify(text);

    fresh = root ++> Thought(
        content=text,
        category=cat,
        created_at=when,
        strength=1
    );

    mine: set[str] = set();
    for spec in match_skills(text) {
        skill = ensure_skill(spec.name, spec.blurb, spec.target);
        fresh +>:Builds(weight=1.0):+> skill;
        mine.add(spec.name);
    }

    # Two thoughts relate mostly because they built the same skill, and only
    # secondarily because they share words. Measured on the seed corpus, pure
    # word overlap peaked at 0.14 and half its top pairs were coincidence
    # ("whiteboard session" vs "slept badly"), so shared skills carry the
    # weight and lexical overlap only breaks ties.
    candidates: list[Peer] = [];
    for other in existing {
        theirs: set[str] = set();
        for s in [other ->:Builds:->] {
            theirs.add(s.name);
        }

        smaller = min(len(mine), len(theirs));
        shared = len(mine & theirs) / smaller if smaller > 0 else 0.0;
        lex = similarity(text, other.content);
        score = 0.65 * shared + 0.35 * lex;

        if score >= 0.22 {
            shared_names: list[str] = [];
            for sname in mine {
                if sname in theirs {
                    shared_names.append(sname);
                }
            }
            why = "word overlap";
            if len(shared_names) > 0 {
                why = "shared skill: " + ", ".join(shared_names);
                if lex >= 0.08 {
                    why = why + " + word overlap";
                }
            }
            candidates.append(Peer(score=score, target=other, reason=why));
        }
    }

    # Cap per thought: linking everything above the threshold makes a hairball,
    # and a hairball is not a map.
    ranked = sorted(candidates, key=lambda (p: Peer) -> float { return p.score; }, reverse=True);
    for peer in ranked[:3] {
        fresh +>:Link(weight=peer.score, reason=peer.reason):+> peer.target;
        peer.target.strength = peer.target.strength + 1;
    }

    return fresh;
}

"""Capture a thought, auto-categorize it, and wire it into the graph.

The auto-wiring is the point: the user never draws an edge, so the brain
assembles its own structure - and its own picture of what they are learning.
"""
def:pub create_thought(content: str, category: str = "") -> bool {
    text = content.strip();
    if not text {
        return False;
    }
    _ = wire_thought(text, category, datetime.now().isoformat());
    return True;
}

"""Forget a thought. Deleting the node cascades to all of its edges."""
def:pub delete_thought(id: str) -> bool {
    target = jobj(id);
    if isinstance(target, Thought) {
        del target;
        return True;
    }
    return False;
}

"""Force-directed layout over a 1000x1000 space.

Deterministic on purpose: seeded by phyllotaxis rather than an RNG, so the
same brain lays out identically on every load and nodes don't teleport
between refreshes. Connected nodes pull together, everything else pushes
apart, and gravity keeps the cluster centered.
"""
def layout(ids: list[str], links: list[GraphLink]) -> dict[str, list[float]] {
    pos: dict[str, list[float]] = {};
    n = len(ids);
    center = CANVAS / 2.0;
    middle = CANVAS_H / 2.0;

    if n == 0 {
        return pos;
    }
    if n == 1 {
        pos[ids[0]] = [center, middle];
        return pos;
    }

    spread = CANVAS * 0.34;
    for (i, tid) in enumerate(ids) {
        angle = 2.399963 * i;
        r = spread * math.sqrt((i + 1.0) / n);
        pos[tid] = [center + r * math.cos(angle), middle + r * math.sin(angle) * 1.5];
    }

    repel = CANVAS * CANVAS * 0.048;
    rest = CANVAS * 0.15;
    margin = CANVAS * 0.07;
    steps = 260;

    for step in range(steps) {
        cool = 1.0 - (step / steps);
        push: dict[str, list[float]] = {};
        for tid in ids {
            push[tid] = [0.0, 0.0];
        }

        for i in range(n) {
            for j in range(i + 1, n) {
                a = ids[i];
                b = ids[j];
                dx = pos[a][0] - pos[b][0];
                dy = pos[a][1] - pos[b][1];
                d2 = dx * dx + dy * dy;
                if d2 < 1.0 {
                    dx = 1.0 + i;
                    dy = 1.0 + j;
                    d2 = dx * dx + dy * dy;
                }
                d = math.sqrt(d2);
                f = repel / d2;
                ux = dx / d;
                uy = dy / d;
                push[a][0] = push[a][0] + ux * f;
                push[a][1] = push[a][1] + uy * f;
                push[b][0] = push[b][0] - ux * f;
                push[b][1] = push[b][1] - uy * f;
            }
        }

        for l in links {
            if l.source in pos and l.target in pos {
                dx = pos[l.target][0] - pos[l.source][0];
                dy = pos[l.target][1] - pos[l.source][1];
                d = math.sqrt(dx * dx + dy * dy);
                if d > 0.001 {
                    f = (d - rest) * (0.6 + l.weight);
                    ux = dx / d;
                    uy = dy / d;
                    push[l.source][0] = push[l.source][0] + ux * f;
                    push[l.source][1] = push[l.source][1] + uy * f;
                    push[l.target][0] = push[l.target][0] - ux * f;
                    push[l.target][1] = push[l.target][1] - uy * f;
                }
            }
        }

        cap = CANVAS * 0.05 * cool + 0.5;
        for tid in ids {
            vx = (push[tid][0] + (center - pos[tid][0]) * 0.030) * 0.016;
            vy = (push[tid][1] + (middle - pos[tid][1]) * 0.018) * 0.016;
            mag = math.sqrt(vx * vx + vy * vy);
            if mag > cap {
                vx = vx / mag * cap;
                vy = vy / mag * cap;
            }
            pos[tid] = [
                max(margin, min(CANVAS - margin, pos[tid][0] + vx)),
                max(margin, min(CANVAS_H - margin, pos[tid][1] + vy))
            ];
        }
    }

    return refit(pos, ids);
}

"""Scale the settled layout out to fill the canvas.

Force simulation converges to whatever size the forces balance at, which for
a small graph is a little clump in the middle of a big empty frame. Rescaling
the bounding box to the viewport is what makes the graph look designed rather
than merely simulated. Uniform scale, so relative distances survive.
"""
def refit(pos: dict[str, list[float]], ids: list[str]) -> dict[str, list[float]] {
    if len(ids) < 2 {
        return pos;
    }

    xs = [pos[i][0] for i in ids if i in pos];
    ys = [pos[i][1] for i in ids if i in pos];
    if not xs or not ys {
        return pos;
    }

    pad = CANVAS * 0.13;
    span_x = max(xs) - min(xs);
    span_y = max(ys) - min(ys);
    if span_x < 1.0 or span_y < 1.0 {
        return pos;
    }

    scale = min((CANVAS - pad * 2.0) / span_x, (CANVAS_H - pad * 2.0) / span_y);
    off_x = (CANVAS - span_x * scale) / 2.0 - min(xs) * scale;
    off_y = (CANVAS_H - span_y * scale) / 2.0 - min(ys) * scale;

    out: dict[str, list[float]] = {};
    for i in ids {
        if i in pos {
            out[i] = [pos[i][0] * scale + off_x, pos[i][1] * scale + off_y];
        }
    }
    return out;
}

"""A believable brain, so the graph has something to say on first open.

Dated backwards from today so the feed reads like real use rather than
seventeen thoughts captured in the same second.
"""
glob DEMO: list[list[str]] = [
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
    ["We met at the meetup and talked about scale and latency tradeoffs for an hour", "memory"]
];

"""Populate an empty brain with demo data. Returns how many were added."""
def:pub seed_demo() -> int {
    if [root -->[?:Thought]] {
        return 0;
    }

    start = datetime.now() - timedelta(days=len(DEMO));
    for (i, row) in enumerate(DEMO) {
        when = (start + timedelta(days=i, hours=i % 7)).isoformat();
        _ = wire_thought(row[0], row[1], when);
    }
    return len(DEMO);
}

"""Erase the whole brain - every thought, skill and edge."""
def:pub reset_brain() -> int {
    gone = 0;
    for t in [root -->[?:Thought]] {
        del t;
        gone += 1;
    }
    for s in [root -->[?:Skill]] {
        del s;
    }
    return gone;
}

walker:pub LoadBrain {
    """Traverse the brain and report its nodes, edges and skill progress."""

    has thoughts: list[Thought] = [],
        skills: list[Skill] = [],
        nodes: list[GraphNode] = [],
        links: list[GraphLink] = [],
        reports: list[BrainView] = [];

    can start with Root entry {
        visit [-->];
    }

    can gather_thought with Thought entry {
        self.thoughts.append(here);
    }

    can gather_skill with Skill entry {
        self.skills.append(here);
    }

    can assemble with Root exit {
        ids: list[str] = [];
        reps: dict[str, int] = {};

        for t in self.thoughts {
            tid = jid(t);
            ids.append(tid);

            for other in [t ->:Link:->] {
                weight = 0.5;
                why = "";
                for e in [edge t ->:Link:-> other] {
                    weight = e.weight;
                    why = e.reason;
                }
                self.links.append(
                    GraphLink(
                        source=tid,
                        target=jid(other),
                        weight=weight,
                        kind="link",
                        reason=why
                    )
                );
            }

            for skill in [t ->:Builds:->] {
                sid = jid(skill);
                reps[sid] = reps[sid] + 1 if sid in reps else 1;
                self.links.append(
                    GraphLink(
                        source=tid,
                        target=sid,
                        weight=1.0,
                        kind="builds",
                        reason="this thought feeds the skill"
                    )
                );
            }
        }

        for s in self.skills {
            ids.append(jid(s));
        }

        pos = layout(ids, self.links);

        for t in self.thoughts {
            tid = jid(t);
            px = CANVAS / 2.0;
            py = CANVAS_H / 2.0;
            if tid in pos {
                px = pos[tid][0];
                py = pos[tid][1];
            }
            words = t.content.split();
            label = " ".join(words[:4]) if len(words) > 4 else t.content;
            self.nodes.append(GraphNode(
                id=tid,
                kind="thought",
                label=label,
                detail=t.content,
                category=t.category,
                strength=t.strength,
                created_at=t.created_at,
                x=px,
                y=py
            ));
        }

        views: list[SkillView] = [];
        for s in self.skills {
            sid = jid(s);
            px = CANVAS / 2.0;
            py = CANVAS_H / 2.0;
            if sid in pos {
                px = pos[sid][0];
                py = pos[sid][1];
            }
            hits = reps[sid] if sid in reps else 0;
            mastery = 1.0 if hits >= s.target else hits / s.target;

            self.nodes.append(GraphNode(
                id=sid,
                kind="skill",
                label=s.name,
                detail=s.blurb,
                category="skill",
                strength=hits,
                x=px,
                y=py
            ));
            views.append(SkillView(
                id=sid,
                name=s.name,
                blurb=s.blurb,
                reps=hits,
                target=s.target,
                mastery=mastery
            ));
        }

        report BrainView(nodes=self.nodes, links=self.links, skills=views);
    }
}
