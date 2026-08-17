# Trace — a second brain that turns memories into a graph

A mobile-first **second brain** built with [Jac](https://www.jaseci.org/). Drop a thought into the composer and the app categorizes it, links it to related memories, and renders the whole thing as a living, animated knowledge graph. Repeated concepts accumulate into **skills** with mastery rings, so you can watch understanding compound over time.

Built at Jac Hacks (Founders Inc. SF / Jaseci Labs), June 2026.

## How it was built

This was built by directing **Devin**, an AI coding agent, toward a specific technical spec — rather than hand-writing every line. My role was specifying the requirements (a hand-rolled graph camera engine with no external graphing library, optimistic-submit with rollback, the categorization/linking behavior) and validating the output against that spec.

## What it does

- **Composer** — write a thought in plain language; the server categorizes it and auto-links it to semantically related nodes.
- **Brain graph** — an interactive force-directed graph of every thought and skill. Pan with momentum, tap a node to glide the camera to it, hit ⛶ to auto-fit. Edges are bezier curves whose opacity encodes link weight; skill nodes wear a mastery progress ring.
- **Feed** — a reverse-chronological stream of thoughts with staggered entrances and optimistic submit (the node appears instantly and the server reconciles in the background).
- **Skills** — concepts the app has seen repeatedly, each with a rep count and a mastery target.
- **Node sheet & confirm dialog** — bottom-sheet detail view for any node and a reusable confirmation flow for destructive actions (delete/wipe).

## Stack

- **Jac `==0.34.7`** — both the server (object-spatial brain in `endpoints.sv.jac`) and the client (React components in `components/*.cl.jac`)
- **React 18 + TypeScript + Vite** — client render pipeline, wired through Jac's `cl` blocks
- **No external graph library** — the camera engine, force layout, and animations are hand-rolled

## Run it

Requires the Jac CLI (`pip install jaclang`).

```bash
jac start --dev main.jac
```

Open `http://localhost:8003/` (or whichever port `jac start` reports).
