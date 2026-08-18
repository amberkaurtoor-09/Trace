"""Trace - the app shell.

One stateful component owns the brain and prop-drills it into the sections
(jac-cl-organization's stateful-shell pattern). Handler bodies live in
frontend.impl.jac so this file stays a readable description of the UI.
"""

import "./global.css";

import from .components.BrainGraph { BrainGraph }
import from .components.CategoryLegend { CategoryLegend }
import from .components.TabBar { TabBar }
import from .components.Composer { Composer }
import from .components.Feed { Feed }
import from .components.Skills { Skills }
import from .components.NodeSheet { NodeSheet }
import from .components.ConfirmDialog { ConfirmDialog }
import from .components.palette { cat_color }

sv import from endpoints {
    GraphNode, GraphLink, SkillView, LoadBrain,
    create_thought, delete_thought, seed_demo, reset_brain
}

def:pub app -> JsxElement {
    has nodes: list[GraphNode] = [],
        links: list[GraphLink] = [],
        skills: list[SkillView] = [],
        tab: str = "brain",
        hidden: list[str] = [],
        focus: str = "",
        composing: bool = False,
        legendOpen: bool = False,
        busy: bool = False,
        loaded: bool = False,
        error: str = "",
        confirmWipe: bool = False,
        pendingDelete: str = "",
        lastCapture: str = "";

    async can with entry {
        refresh();
    }

    async def refresh -> None;
    async def submit(text: str, cat: str) -> None;
    async def confirmDelete -> None;
    async def loadDemo -> None;
    async def wipe -> None;

    def choose(name: str) -> None {
        tab = name;
        focus = "";
    }

    def toggle(name: str) -> None {
        hidden = [c for c in hidden if c != name] if name in hidden else hidden + [name];
    }

    def pickNode(id: str) -> None {
        focus = "" if id == focus else id;
    }

    def clearFocus -> None {
        focus = "";
    }

    def flipLegend -> None {
        legendOpen = not legendOpen;
    }

    def openComposer -> None {
        composing = True;
    }

    def closeComposer -> None {
        composing = False;
    }

    def askRemove(id: str) -> None {
        pendingDelete = id;
    }

    def cancelDelete -> None {
        pendingDelete = "";
    }

    def askWipe(_e: MouseEvent) -> None {
        confirmWipe = True;
    }

    def cancelWipe -> None {
        confirmWipe = False;
    }

    def startHere(_e: MouseEvent) -> None {
        composing = True;
    }

    def dismissError(_e: MouseEvent) -> None {
        error = "";
    }

    thoughts = [n for n in nodes if n.kind == "thought"];
    visible = [n for n in thoughts if n.category not in hidden];

    # Flattened to plain strings rather than an Optional node: a type guard
    # inside a JSX slot does not narrow across the slot boundary (E1099).
    peekKind = "";
    peekText = "";
    peekTint = "#c9d1ff";
    peekIsThought = False;
    for n in nodes {
        if n.id == focus {
            peekKind = "Skill" if n.kind == "skill" else n.category;
            peekText = n.detail;
            peekIsThought = n.kind == "thought";
            if n.kind == "thought" {
                peekTint = cat_color(n.category);
            }
        }
    }

    # Labels of everything the focused node connects to, plus the inspectable
    # reason string the server stored on each Link edge.
    labelOf: dict[str, str] = {};
    for n in nodes {
        labelOf[n.id] = n.label;
    }
    peekRelated: list[str] = [];
    peekSkills: list[str] = [];
    if focus {
        for l in links {
            other = "";
            if l.source == focus {
                other = l.target;
            } elif l.target == focus {
                other = l.source;
            }
            if other and other in labelOf {
                name = labelOf[other];
                if l.kind == "builds" {
                    if l.source == focus {
                        peekSkills = peekSkills + [labelOf[l.target]];
                    } else {
                        peekRelated = peekRelated + [name + " · feeds this skill"];
                    }
                } else {
                    pct = int(l.weight * 100.0 + 0.5);
                    why = l.reason if l.reason else "related";
                    peekRelated = peekRelated + [
                        name + " · " + str(pct) + "% · " + why
                    ];
                }
            }
        }
    }

    topSkills = skills[:3] if len(skills) > 3 else skills;

    def deleteFocused -> None {
        pendingDelete = focus;
    }

    return <div className={"shell tab-" + tab}>
        <header className="header">
            <span className="logo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
                    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 9 18a3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 2-4.8A3 3 0 0 0 15 8a3 3 0 0 0-3-3Z"/>
                    <path d="M12 5v14"/>
                </svg>
            </span>
            <span>
                <h1 className="brand-name">Trace</h1>
                <p className="brand-tag">Thoughts become a living graph</p>
            </span>
            <span className="engine-chip">hand-rolled graph · no library</span>
        </header>

        {if error {
            <div key="toast" className="toast" role="alert">
                <span>{error}</span>
                <button className="toast-dismiss" onClick={dismissError}>Dismiss</button>
            </div>
        }}

        <main className="stage">
            {if not loaded {
                <div key="loading" className="skeleton-stage" aria-label="Loading">
                    <span className="skel-node" style={{"left": "28%", "top": "22%", "width": "46px", "height": "46px"}}></span>
                    <span className="skel-node" style={{"left": "58%", "top": "30%", "width": "30px", "height": "30px", "animationDelay": "120ms"}}></span>
                    <span className="skel-node" style={{"left": "42%", "top": "44%", "width": "22px", "height": "22px", "animationDelay": "240ms"}}></span>
                    <span className="skel-node" style={{"left": "66%", "top": "54%", "width": "40px", "height": "40px", "animationDelay": "360ms"}}></span>
                    <span className="skel-node" style={{"left": "24%", "top": "60%", "width": "26px", "height": "26px", "animationDelay": "480ms"}}></span>
                    <span className="skel-node" style={{"left": "48%", "top": "70%", "width": "34px", "height": "34px", "animationDelay": "600ms"}}></span>
                    <span className="skel-hint">Assembling your brain</span>
                </div>
                skip;
            }}
            <div key="brain" className="graph-wrap">
                <BrainGraph
                    nodes={nodes}
                    links={links}
                    skills={skills}
                    hidden={hidden}
                    focus={focus}
                    onPick={pickNode}
                    onClear={clearFocus}
                />
                {if len(thoughts) == 0 {
                    <div key="empty" className="empty">
                        <h2>Build your second brain</h2>
                        <p>Capture a thought. Trace categorizes it, links related memories, and grows skills from the repeats.</p>
                        <div className="onboard-steps">
                            <div className="onboard-step">
                                <span className="onboard-num">1</span>
                                <span>What's on your mind?</span>
                            </div>
                            <div className="onboard-step">
                                <span className="onboard-num">2</span>
                                <span>It appears as a node and wires itself in</span>
                            </div>
                            <div className="onboard-step">
                                <span className="onboard-num">3</span>
                                <span>Skills update from what you keep thinking about</span>
                            </div>
                        </div>
                        <button className="ghost-btn" onClick={startHere} disabled={busy}>
                            Capture your first thought
                        </button>
                        <button className="ghost-btn" onClick={loadDemo} disabled={busy}>
                            {"Building..." if busy else "Or load a demo brain"}
                        </button>
                    </div>
                }}
                {if len(thoughts) > 0 {
                    <CategoryLegend
                        key="legend"
                        hidden={hidden}
                        open={legendOpen}
                        onToggle={toggle}
                        onExpand={flipLegend}
                    />
                    <div key="count" className="count-pill">
                        <b>{str(len(visible))}</b>{" thoughts · "}<b>{str(len(skills))}</b>{" skills"}
                    </div>
                }}
                {if peekText {
                    <NodeSheet
                        key="sheet-mobile"
                        kind={peekKind}
                        tint={peekTint}
                        text={peekText}
                        related={peekRelated}
                        skillsFed={peekSkills}
                        canDelete={peekIsThought}
                        docked={False}
                        onDelete={deleteFocused}
                        onClose={clearFocus}
                    />
                }}
            </div>

            <aside className="dock">
                {if tab == "brain" {
                    <div key="dock-brain" className="dock-brain">
                        <Composer
                            busy={busy}
                            onSubmit={submit}
                            onClose={closeComposer}
                            embedded={True}
                        />
                        {if lastCapture {
                            <div key="story" className="capture-story">{lastCapture}</div>
                        }}
                        {if peekText {
                            <NodeSheet
                                key="sheet-dock"
                                kind={peekKind}
                                tint={peekTint}
                                text={peekText}
                                related={peekRelated}
                                skillsFed={peekSkills}
                                canDelete={peekIsThought}
                                docked={True}
                                onDelete={deleteFocused}
                                onClose={clearFocus}
                            />
                        }}
                        {if not peekText {
                            <div key="guide" className="dock-guide">
                                <p className="section-title">Tap a node</p>
                                <p className="dock-copy">
                                    Relatedness is a weighted Link edge — shared skills first, word overlap to break ties, capped at three neighbours so the map stays a map.
                                </p>
                                {if len(topSkills) > 0 {
                                    <p key="sk-title" className="section-title">Skills forming</p>
                                }}
                                {for s in topSkills {
                                    <div key={s.id} className="dock-skill">
                                        <span className="skill-name">{s.name}</span>
                                        <span className="card-meta">{str(s.reps) + "/" + str(s.target)}</span>
                                    </div>
                                }}
                            </div>
                        }}
                    </div>
                }}
                {if tab == "feed" {
                    <Feed key="feed" nodes={nodes} links={links} onDelete={askRemove}/>
                }}
                {if tab == "skills" {
                    <Skills key="skills" nodes={nodes} links={links} skills={skills}/>
                }}
                {if tab == "me" {
                    <div key="me" className="scroll">
                        <p className="section-title">How this was built</p>
                        <div className="card">
                            <p className="card-text">
                                {"I directed Devin, an AI coding agent, against a written spec — "
                                 + "not autocomplete. The spec required a hand-rolled graph camera "
                                 + "(no vis.js / D3), optimistic submit with rollback, and auto-linking "
                                 + "from shared skills rather than raw word overlap."}
                            </p>
                        </div>
                        <p className="section-title">This brain</p>
                        <div className="card">
                            <p className="card-text">
                                {"Every thought is a node on a Jac object-spatial graph. Relatedness is a typed Link edge, "
                                 + "and a Builds edge points at the skill a memory moved forward. "
                                 + "Nothing here is a table."}
                            </p>
                            <p className="card-links">
                                {str(len(nodes)) + " nodes · " + str(len(links)) + " edges"}
                            </p>
                        </div>
                        <p className="section-title">Danger zone</p>
                        <button className="ghost-btn wide" onClick={askWipe} disabled={busy}>
                            Erase this brain
                        </button>
                    </div>
                }}
            </aside>
        </main>

        <TabBar active={tab} onSelect={choose} onCompose={openComposer}/>

        {if composing {
            <div key="composer-overlay" className="composer-overlay">
                <Composer busy={busy} onSubmit={submit} onClose={closeComposer}/>
            </div>
        }}

        {if confirmWipe {
            <ConfirmDialog
                key="confirm-wipe"
                title="Erase this brain?"
                body="Every thought, link and skill will be permanently deleted. This cannot be undone."
                action="Erase everything"
                busy={busy}
                onConfirm={wipe}
                onCancel={cancelWipe}
            />
        }}

        {if pendingDelete {
            <ConfirmDialog
                key="confirm-delete"
                title="Forget this thought?"
                body="The thought and its links will be removed. Skills it fed will lose one rep."
                action="Forget it"
                busy={busy}
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
            />
        }}
    </div>;
}
