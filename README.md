# Trace

**An AI-powered second brain that turns thoughts into a living knowledge graph.**

<p>
  <a href="https://github.com/amberkaurtoor-09/Trace">GitHub</a>
  · React + TypeScript + Vite
  · Jac object-spatial backend
  · no graph library
</p>

<img src="docs/hero.svg" alt="Trace: capture a thought, watch it wire into a knowledge graph, and see skills form from the repeats" />

Drop a thought in plain language. Trace categorizes it, auto-links related memories, and renders the whole brain as an interactive map. Repeated concepts accumulate into **skills** with mastery rings — so you can watch understanding compound instead of collecting a pile of notes.

Built at Jac Hacks (Founders Inc. SF / Jaseci Labs), June 2026.

---

## What I built

- A mobile-first capture loop that still reads as a **desktop studio**: graph on the left, composer + inspector on the right.
- Auto-categorization and auto-linking — the user never draws an edge.
- A **hand-rolled graph camera** (pan with momentum, pinch/wheel zoom, glide-to-node, auto-fit) with bezier edges whose opacity encodes link weight.
- Skills that are *derived*, not entered: a `Builds` edge from thought → skill, mastery counted from the memories that feed it.
- Optimistic submit with rollback, so a thought appears instantly and the server reconciles in the background.
- An inspector that shows **why** two thoughts linked (shared skill vs word overlap, plus the numeric weight).

## Technical highlights

| Decision | Why it matters |
|---|---|
| Directed **Devin**, an AI coding agent, against a written spec | Spec + review, not autocomplete |
| Custom graph engine, **no vis.js / D3 / Cytoscape** | Camera, layout, and animation are application code |
| React 18 + TypeScript + Vite | Client render pipeline through Jac `cl` blocks |
| Optimistic updates with rollback | Instant UI; failure restores the previous graph |
| Jac / Jaseci object-spatial backend | The brain *is* a graph (`Thought --Link--> Thought`, `Thought --Builds--> Skill`) |
| Relatedness = 0.65 × shared skills + 0.35 × word overlap, capped at 3 peers | Measured on the seed corpus: pure overlap peaked at 0.14 and half its top pairs were coincidence |
| Inspectable `Link.reason` | A recruiter can tap a node and see the scoring, not just a pretty picture |

## How it was built

This was built by directing **Devin** toward a specific technical spec — rather than hand-writing every line or accepting whatever the agent generated.

My role:

1. Write the architecture and constraints (no external graph library, optimistic submit + rollback, shared-skill linking instead of raw TF-IDF).
2. Direct the agent the way I'd direct an engineer — tasks, review, pushback.
3. Validate the implementation against the spec (layout determinism, Jac compile-to-JS gotchas, camera bookkeeping in module `glob`s because pointer events outrun React).

That split — **spec / direction / validation vs generated code** — is the interesting part of the project.

## The 60-second loop

```text
What's on your mind?
        │
        ▼
  thought appears as a node   ← optimistic, rolls back on failure
        │
        ▼
  related concepts connect    ← Link edges, weight + reason on the wire
        │
        ▼
  skills update               ← Builds edges, mastery rings
```

On desktop the graph stays on screen the whole time. Submit, and the new node is focused with a story chip: *Filed as learning · linked to 2 thoughts · feeds Systems Thinking*.

## Technical architecture

```text
Composer  ──create_thought──►  wire_thought()
                                   │
                                   ├─ classify (keyword categories)
                                   ├─ match_skills  →  Thought --Builds--> Skill
                                   └─ peer score    →  Thought --Link--> Thought
                                                        reason stored on the edge

LoadBrain walker
  visits every Thought / Skill from root
  force-layout (phyllotaxis seed, 260 steps, deterministic)
  reports GraphNode / GraphLink / SkillView

BrainGraph (client)
  camera in module globs (not React state)
  pan + momentum, pinch/wheel zoom, glide-to-node
  bezier edges, mastery rings, neighbourhood focus
```

**Layout.** Portrait canvas (1000×1700) so a phone doesn't letterbox a square map. Positions are deterministic on purpose: the same brain lays out identically on every load, so nodes don't teleport between refreshes.

**Compile-to-JS gotchas found by testing in the browser** (worth knowing if you read the code):

- `len()` of a dict compiles to `undefined`, which silently disabled focus highlighting.
- A `glob` is module-local, so cross-file imports die at bundle time — palette helpers are functions, not imported globs.
- Inline `<span>` bars ignore height, so every progress bar rendered empty until the markup changed.

## Screenshots / try it

The hero above is the product frame: graph + capture + inspector. Run it locally to pan the real camera and submit a thought.

```bash
pip install jaclang
jac start --dev main.jac
```

Open the **App** URL printed in the terminal. First load seeds a demo brain automatically so you never stare at an empty map.

There is no hosted live demo. A polished local run (and this repo) is the intended review path.

## Project layout

```text
main.jac              # entry — mounts client app, registers server
endpoints.sv.jac      # graph model, LoadBrain walker, create/delete/seed
frontend.cl.jac       # stateful shell (graph + dock)
frontend.impl.jac     # async handlers, optimistic submit, auto-seed
components/           # BrainGraph, Composer, NodeSheet, Skills, Feed, …
global.css            # design system + desktop studio layout
```

## Stack

- **Jac** — server walkers + React client in one language (`jac-version` in `jac.toml`)
- **React 18 + TypeScript + Vite** — client render pipeline
- **No external graph library** — layout on the server, camera on the client

---

Jac Hacks project.
