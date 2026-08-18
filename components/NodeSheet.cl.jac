"""Detail sheet for the focused graph node.

Shows the thought, the skills it feeds, and — this is the point for anyone
reading the graph as an engineer — *why* each neighbour is connected:
shared skill, word overlap, and the numeric relatedness weight.
"""

def:pub NodeSheet(
    kind: str,
    tint: str,
    text: str,
    related: list[str],
    skillsFed: list[str],
    canDelete: bool,
    docked: bool,
    onDelete: Callable[[], None],
    onClose: Callable[[], None]
) -> JsxElement {
    def close(_e: MouseEvent) {
        onClose();
    }

    def del_(_e: MouseEvent) {
        onDelete();
    }

    return <div className={"node-sheet docked" if docked else "node-sheet"}>
        <div className="node-sheet-top">
            <span className="node-kind" style={{"color": tint}}>{kind}</span>
            <button className="node-close" onClick={close} aria-label="Close">&times;</button>
        </div>
        <p className="node-text">{text}</p>
        {if len(skillsFed) > 0 {
            <div key="skills" className="inspect-block">
                <p className="inspect-label">Feeds</p>
                <div className="node-neighbors">
                    {for (i, s) in enumerate(skillsFed) {
                        <span key={str(i)} className="build-tag">{s}</span>
                    }}
                </div>
            </div>
        }}
        {if len(related) > 0 {
            <div key="related" className="inspect-block">
                <p className="inspect-label">Why it linked</p>
                <ul className="inspect-list">
                    {for (i, row) in enumerate(related) {
                        <li key={str(i)}>{row}</li>
                    }}
                </ul>
            </div>
        }}
        {if canDelete {
            <div key="actions" className="node-actions">
                <button className="node-del" onClick={del_}>Forget this thought</button>
            </div>
        }}
    </div>;
}
