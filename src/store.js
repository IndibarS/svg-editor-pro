import { writable } from 'svelte/store';

function createSvgModel() {
    let idCounter = 1;
    let clipboard = null; // stores a deep-cloned node ready to paste
    
    // Physical export bounds
    const defaultWidth = 600;
    const defaultHeight = 600;

    const initialTree = {
        id: 'node_' + (idCounter++),
        type: 'svg',
        attributes: { 
            width: String(defaultWidth), 
            height: String(defaultHeight), 
            viewBox: `0 0 ${defaultWidth} ${defaultHeight}`,
            xmlns: "http://www.w3.org/2000/svg"
        },
        children: [],
        commands: [],
        hidden: false
    };

    const defaultPath = {
        id: 'node_' + (idCounter++),
        type: 'path',
        attributes: { stroke: "#ffffff", fill: "#00000000", "stroke-width": "3", d: "" },
        children: [],
        commands: [{ type: "M", x: 300, y: 300 }],
        hidden: false
    };
    
    // Utility strictly inside this closure to initialize
    const cmdsToPath = (cmds) => {
        if (!cmds || cmds.length === 0) return "";
        let d = "";
        if (cmds[0].type !== "M") d = "M 0 0 ";
        cmds.forEach(cmd => {
            if (cmd.type === "M") d += `M ${cmd.x} ${cmd.y} `;
            if (cmd.type === "L") d += `L ${cmd.x} ${cmd.y} `;
            if (cmd.type === "H") d += `H ${cmd.x} `;
            if (cmd.type === "V") d += `V ${cmd.y} `;
            if (cmd.type === "C") d += `C ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y} `;
            if (cmd.type === "S") d += `S ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y} `;
            if (cmd.type === "Q") d += `Q ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y} `;
            if (cmd.type === "T") d += `T ${cmd.x} ${cmd.y} `;
            if (cmd.type === "A") d += `A ${cmd.rx} ${cmd.ry} ${cmd.xAxisRotation} ${cmd.largeArcFlag} ${cmd.sweepFlag} ${cmd.x} ${cmd.y} `;
            if (cmd.type === "Z") d += `Z `;
        });
        return d.trim();
    };

    defaultPath.attributes.d = cmdsToPath(defaultPath.commands);
    initialTree.children.push(defaultPath);

    const store = writable({
        tree: initialTree,
        activeNodeId: defaultPath.id,
        idCounter
    });

    // --- Helpers that wrap the store.update ---
    
    const findParent = (tree, nodeId) => {
        if (tree.children && tree.children.find(c => c.id === nodeId)) return tree;
        for (let child of (tree.children || [])) {
            let found = findParent(child, nodeId);
            if (found) return found;
        }
        return null;
    };

    const findNodeMap = (tree, nodeId) => {
        if (tree.id === nodeId) return tree;
        for (let child of (tree.children || [])) {
            let found = findNodeMap(child, nodeId);
            if (found) return found;
        }
        return null;
    };

    const isEffectivelyHidden = (tree, nodeId) => {
        const check = (node, parentHidden = false) => {
            const currentHidden = parentHidden || node.hidden;
            if (node.id === nodeId) return !!currentHidden;
            for (let child of (node.children || [])) {
                const res = check(child, currentHidden);
                if (res !== null) return res;
            }
            return null;
        };
        return check(tree) || false;
    };

    // --- Copy / Paste helpers ---

    const deepClone = (node) => ({
        id: node.id,
        type: node.type,
        attributes: { ...node.attributes },
        children: (node.children || []).map(deepClone),
        commands: (node.commands || []).map(c => ({ ...c })),
        hidden: node.hidden
    });

    const deepCloneWithNewIds = (node, newId) => ({
        id: newId(),
        type: node.type,
        attributes: { ...node.attributes },
        children: (node.children || []).map(c => deepCloneWithNewIds(c, newId)),
        commands: (node.commands || []).map(c => ({ ...c })),
        hidden: node.hidden
    });

    /** Nudges the top-level node's position by dx/dy based on its type */
    const offsetNode = (node, dx, dy) => {
        const a = node.attributes;
        if (node.type === 'rect' || node.type === 'image') {
            if (a.x !== undefined) a.x = (parseFloat(String(a.x)) || 0) + dx;
            if (a.y !== undefined) a.y = (parseFloat(String(a.y)) || 0) + dy;
        } else if (node.type === 'circle' || node.type === 'ellipse') {
            if (a.cx !== undefined) a.cx = (parseFloat(String(a.cx)) || 0) + dx;
            if (a.cy !== undefined) a.cy = (parseFloat(String(a.cy)) || 0) + dy;
        } else if (node.type === 'path') {
            node.commands = node.commands.map(cmd => {
                const c = { ...cmd };
                if (c.x  !== undefined) c.x  += dx;
                if (c.y  !== undefined) c.y  += dy;
                if (c.x1 !== undefined) c.x1 += dx;
                if (c.y1 !== undefined) c.y1 += dy;
                if (c.x2 !== undefined) c.x2 += dx;
                if (c.y2 !== undefined) c.y2 += dy;
                return c;
            });
            node.attributes.d = cmdsToPath(node.commands);
        }
        // groups: children keep their own relative positions, no offset needed
    };


    return {
        subscribe: store.subscribe,
        
        isEffectivelyHidden,

        setActive: (id) => store.update(s => ({ ...s, activeNodeId: id })),

        updateAttribute: (id, key, val) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (node) {
                node.attributes[key] = val;
                s.tree = { ...s.tree };
            }
            return { ...s };
        }),

        toggleVisibility: (id) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (node) {
                node.hidden = !node.hidden;
                s.tree = { ...s.tree };
            }
            return { ...s };
        }),

        updateCommand: (id, index, key, val) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (node && node.type === 'path') {
                node.commands[index][key] = val;
                node.attributes.d = cmdsToPath(node.commands);
                s.tree = { ...s.tree };
            }
            return { ...s };
        }),

        deleteCommand: (id, index) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (node && node.type === 'path') {
                node.commands.splice(index, 1);
                node.attributes.d = cmdsToPath(node.commands);
            }
            return { ...s };
        }),

        addCommand: (id, type, index = -1) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (!node || node.type !== 'path') return s;

            const referenceIndex = index > 0 ? index - 1 : node.commands.length - 1;
            let last = node.commands[referenceIndex] || { x: 300, y: 300 };
            let newCmd;

            if (type === "M") newCmd = { type: "M", x: last.x || 300, y: last.y || 300 };
            if (type === "L") newCmd = { type: "L", x: (last.x || 300) + 50, y: (last.y || 300) + 50 };
            if (type === "H") newCmd = { type: "H", x: (last.x || 300) + 50 };
            if (type === "V") newCmd = { type: "V", y: (last.y || 300) + 50 };
            if (type === "Z") newCmd = { type: "Z" };
            if (type === "C") {
                newCmd = {
                    type: "C",
                    x1: (last.x || 300) - 50, y1: (last.y || 300) - 50,
                    x2: (last.x || 300) + 50, y2: (last.y || 300) - 50,
                    x: (last.x || 300) + 100, y: (last.y || 300)
                };
            }
            if (type === "S") {
                newCmd = {
                    type: "S",
                    x2: (last.x || 300) + 50, y2: (last.y || 300) - 50,
                    x: (last.x || 300) + 100, y: (last.y || 300)
                };
            }
            if (type === "Q") {
                newCmd = {
                    type: "Q",
                    x1: (last.x || 300) + 25, y1: (last.y || 300) - 50,
                    x: (last.x || 300) + 50, y: (last.y || 300)
                };
            }
            if (type === "T") newCmd = { type: "T", x: (last.x || 300) + 50, y: (last.y || 300) };
            if (type === "A") {
                newCmd = {
                    type: "A",
                    rx: 50, ry: 50, 
                    xAxisRotation: 0, 
                    largeArcFlag: 0, sweepFlag: 1, 
                    x: (last.x || 300) + 50, y: (last.y || 300) + 50
                };
            }

            if (index === -1) {
                node.commands.push(newCmd);
            } else {
                node.commands.splice(index, 0, newCmd);
            }
            node.attributes.d = cmdsToPath(node.commands);
            return { ...s };
        }),

        deleteNode: (id) => store.update(s => {
            if (id === s.tree.id) return s;
            const parent = findParent(s.tree, id);
            if (parent) {
                parent.children = parent.children.filter(c => c.id !== id);
                if (s.activeNodeId === id) s.activeNodeId = parent.id;
            }
            return { ...s };
        }),

        addElement: (type, parentId, index = -1) => store.update(s => {
            const parent = findNodeMap(s.tree, parentId) || s.tree;
            
            let attrs = { fill: "#00000000", stroke: "#ffffff", "stroke-width": "2" };
            if (type === 'rect') attrs = { ...attrs, x: 100, y: 100, width: 100, height: 100 };
            else if (type === 'circle') attrs = { ...attrs, cx: 300, cy: 300, r: 50 };
            else if (type === 'ellipse') attrs = { ...attrs, cx: 300, cy: 300, rx: 80, ry: 50 };
            else if (type === 'path') attrs = { ...attrs, d: "M 200 200" };
            else if (type === 'g') attrs = /** @type {any} */ ({});
            else if (type === 'image') attrs = /** @type {any} */ ({ href: '', x: 100, y: 100, width: 200, height: 200, preserveAspectRatio: 'xMidYMid meet' });

            const newNode = {
                id: 'node_' + (s.idCounter++),
                type,
                attributes: attrs,
                children: [],
                commands: type === 'path' ? [{ type: "M", x: 200, y: 200 }] : [],
                hidden: false
            };
            
            if (index === -1) {
                parent.children.push(newNode);
            } else {
                parent.children.splice(index, 0, newNode);
            }
            s.activeNodeId = newNode.id;
            return { ...s };
        }),

        moveNode: (id, targetParentId, insertIndex) => store.update(s => {
            if (id === s.tree.id) return s; 

            const node = findNodeMap(s.tree, id);
            const parent = findParent(s.tree, id);
            const targetParent = findNodeMap(s.tree, targetParentId) || s.tree;

            if (!node || !parent || !targetParent) return s;

            // Cyclic inclusion detection lock
            let current = targetParent;
            while(current) {
                if (current.id === node.id) return s;
                current = findParent(s.tree, current.id);
            }

            const oldIndex = parent.children.findIndex(c => c.id === id);
            parent.children.splice(oldIndex, 1);

            if (parent.id === targetParent.id && oldIndex < insertIndex) {
                insertIndex -= 1;
            }

            targetParent.children.splice(insertIndex, 0, node);
            return { ...s };
        }),

        toSvgString: (astTree, clean = false) => {
            const renderNode = (node) => {
                const isSelfClosing = ['rect', 'circle', 'path', 'line', 'image'].includes(node.type);
                const isRoot = node === astTree;
                
                let effectiveAttrs = { ...node.attributes };
                let styles = [];
                if (node.hidden) styles.push("display: none !important;");
                if (!clean && isRoot) styles.push("overflow: visible;");
                if (!clean && !isRoot) styles.push("cursor: pointer;");
                if (effectiveAttrs.style) styles.push(effectiveAttrs.style);

                if (styles.length > 0) {
                    effectiveAttrs.style = styles.join(' ');
                }

                let attrStr = Object.entries(effectiveAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');
                let idStr = clean ? '' : ` data-id="${node.id}"`;
                
                if (node.children.length === 0 && isSelfClosing) {
                    return `<${node.type}${idStr} ${attrStr} />`;
                } else {
                    let inner = (node.children || []).map(renderNode).join('\n  ');
                    return `<${node.type}${idStr} ${attrStr}>\n  ${inner}\n</${node.type}>`;
                }
            };
            return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` + renderNode(astTree);
        },

        // Needs to be extracted out for pure loading string mapping
        loadFromString: (xmlString) => store.update(s => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, "image/svg+xml");
            const svgEl = doc.querySelector('svg');
            
            if (!svgEl) {
                alert("Could not load SVG.");
                return s;
            }

            const parsePathToCommands = (dStr) => {
                const re = /([MLHVCQSTAZ])\s*([^MLHVCQSTAZ]*)/gi;
                let match;
                const cmds = [];
                while ((match = re.exec(dStr)) !== null) {
                    const type = match[1].toUpperCase();
                    const args = match[2].trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
                    
                    if (type === 'M' && args.length >= 2) cmds.push({ type: 'M', x: args[0], y: args[1] });
                    else if (type === 'L' && args.length >= 2) cmds.push({ type: 'L', x: args[0], y: args[1] });
                    else if (type === 'H' && args.length >= 1) cmds.push({ type: 'H', x: args[0] });
                    else if (type === 'V' && args.length >= 1) cmds.push({ type: 'V', y: args[0] });
                    else if (type === 'C' && args.length >= 6) cmds.push({ type: 'C', x1: args[0], y1: args[1], x2: args[2], y2: args[3], x: args[4], y: args[5] });
                    else if (type === 'S' && args.length >= 4) cmds.push({ type: 'S', x2: args[0], y2: args[1], x: args[2], y: args[3] });
                    else if (type === 'Q' && args.length >= 4) cmds.push({ type: 'Q', x1: args[0], y1: args[1], x: args[2], y: args[3] });
                    else if (type === 'T' && args.length >= 2) cmds.push({ type: 'T', x: args[0], y: args[1] });
                    else if (type === 'A' && args.length >= 7) cmds.push({ type: 'A', rx: args[0], ry: args[1], xAxisRotation: args[2], largeArcFlag: args[3], sweepFlag: args[4], x: args[5], y: args[6] });
                    else if (type === 'Z') cmds.push({ type: 'Z' });
                }
                return cmds;
            };

            const domToNode = (el) => {
                const node = {
                    id: 'node_' + (s.idCounter++),
                    type: el.tagName.toLowerCase(),
                    attributes: /** @type {any} */ ({}),
                    children: [],
                    commands: [],
                    hidden: false
                };
                Array.from(el.attributes).forEach(attr => {
                    node.attributes[attr.name] = attr.value;
                });
                if (node.type === 'path' && node.attributes.d) {
                    node.commands = parsePathToCommands(node.attributes.d);
                }
                Array.from(el.children).forEach(child => {
                    const childNode = domToNode(child);
                    if (childNode.type) node.children.push(childNode);
                });
                return node;
            };

            const newTree = domToNode(svgEl);
            if(!newTree.attributes.xmlns) newTree.attributes.xmlns = "http://www.w3.org/2000/svg";

            return {
                ...s,
                tree: newTree,
                activeNodeId: newTree.id
            };
        }),

        toPathData: (node) => {
            if (!node || node.type !== 'path') return "";
            return cmdsToPath(node.commands);
        },

        copyNode: (id) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (!node || id === s.tree.id) return s;
            // Deep clone without touching the store — just snapshot into clipboard
            clipboard = deepClone(node);
            return s; // no state change
        }),

        pasteNode: () => store.update(s => {
            if (!clipboard) return s;
            // Find parent of active node to paste as a sibling, else append to root
            const parent = findParent(s.tree, s.activeNodeId) || s.tree;
            const clone = deepCloneWithNewIds(clipboard, () => 'node_' + (s.idCounter++));
            offsetNode(clone, 10, 10);
            // Insert right after active node if possible
            const insertIdx = parent.children.findIndex(c => c.id === s.activeNodeId);
            if (insertIdx !== -1) {
                parent.children.splice(insertIdx + 1, 0, clone);
            } else {
                parent.children.push(clone);
            }
            s.activeNodeId = clone.id;
            return { ...s };
        }),

        duplicateNode: (id) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (!node || id === s.tree.id) return s;
            const parent = findParent(s.tree, id) || s.tree;
            const clone = deepCloneWithNewIds(node, () => 'node_' + (s.idCounter++));
            offsetNode(clone, 10, 10);
            const insertIdx = parent.children.findIndex(c => c.id === id);
            if (insertIdx !== -1) {
                parent.children.splice(insertIdx + 1, 0, clone);
            } else {
                parent.children.push(clone);
            }
            s.activeNodeId = clone.id;
            return { ...s };
        }),

        cutNode: (id) => store.update(s => {
            const node = findNodeMap(s.tree, id);
            if (!node || id === s.tree.id) return s;
            clipboard = deepClone(node);
            const parent = findParent(s.tree, id);
            if (parent) {
                parent.children = parent.children.filter(c => c.id !== id);
                if (s.activeNodeId === id) s.activeNodeId = parent.id;
            }
            return { ...s };
        }),

        unhideAll: () => store.update(s => {
            const unhide = (node) => {
                node.hidden = false;
                (node.children || []).forEach(unhide);
            };
            unhide(s.tree);
            return { ...s };
        }),

    };
}

export const modelStore = createSvgModel();
