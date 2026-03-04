const API_BASE = 'http://localhost:3000/api';

let activeMapId = null;
let activeMapData = null;
let activeNodeId = null;

// Infinite Canvas State
let scale = 1;
let translateX = 0;
let translateY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// Debounce Save State
let saveTimeout = null;

// DOM Elements
const mapListEl = document.getElementById('map-list');
const newMapBtn = document.getElementById('new-map-btn');
const mapTitleInput = document.getElementById('map-title');
const archiveMapBtn = document.getElementById('archive-map-btn');
const exportImageBtn = document.getElementById('export-image-btn');
const autoSaveStatus = document.getElementById('auto-save-status');

const tabActive = document.getElementById('tab-active');
const tabArchived = document.getElementById('tab-archived');
let currentTab = 'active'; // 'active' or 'archived'

// History Stack
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

const canvasWrapper = document.getElementById('canvas-wrapper');
const canvasContainer = document.getElementById('canvas-container');
const rootContainer = document.getElementById('mind-map-root');
const svgContainer = document.getElementById('connections-svg');

// Modal Elements
const modal = document.getElementById('node-modal');
const nodeTextInput = document.getElementById('node-text-input');
const saveNodeBtn = document.getElementById('save-node-btn');
const cancelBtn = document.getElementById('cancel-btn');
const addChildBtn = document.getElementById('add-child-btn');
const deleteNodeBtn = document.getElementById('delete-node-btn');

// Resize Observer for SVG dynamic drawing
const resizeObserver = new ResizeObserver(() => {
    drawConnections();
});

// Cryptographic UUID Generator
function generateId() {
    return crypto.randomUUID();
}

// Toast Functionality
function showToast(message) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');

    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2000);
}

// Fetch and render the list of maps
async function loadMapList(preserveActive = true) {
    try {
        const url = currentTab === 'archived' ? `${API_BASE}/maps/archived` : `${API_BASE}/maps`;
        const res = await fetch(url);
        const maps = await res.json();

        mapListEl.innerHTML = '';

        if (maps.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.className = 'map-item empty-state';
            emptyLi.style.border = 'none';
            emptyLi.textContent = currentTab === 'archived' ? 'No archived maps.' : 'No active maps.';
            mapListEl.appendChild(emptyLi);
            return;
        }

        maps.forEach(map => {
            const li = document.createElement('li');
            li.className = 'map-item';

            if (currentTab === 'archived') {
                li.classList.add('map-item-restore');

                const spanText = document.createElement('span');
                spanText.textContent = map.title || 'Untitled';
                spanText.className = 'map-item-text';

                const restoreBtn = document.createElement('button');
                restoreBtn.className = 'restore-btn';
                restoreBtn.textContent = 'Restore';
                restoreBtn.onclick = () => restoreMap(map.id);

                li.appendChild(spanText);
                li.appendChild(restoreBtn);
            } else {
                // Active Maps Logic
                if (preserveActive && map.id === activeMapId) li.classList.add('active');

                const spanText = document.createElement('span');
                spanText.textContent = map.title || 'Untitled';
                spanText.className = 'map-item-text';
                li.appendChild(spanText);

                li.onclick = (e) => {
                    // Prevent loading if we are clicking an inner input
                    if (e.target.tagName !== 'INPUT') loadMap(map.id);
                };

                // Double Click to Rename Inline
                li.ondblclick = (e) => {
                    e.stopPropagation();
                    spanText.style.display = 'none';

                    const inputEl = document.createElement('input');
                    inputEl.type = 'text';
                    inputEl.value = spanText.textContent;
                    inputEl.className = 'map-item-input';

                    li.appendChild(inputEl);
                    inputEl.focus();

                    const saveInlineRender = async () => {
                        const newTitle = inputEl.value.trim() || 'Untitled';
                        spanText.textContent = newTitle;

                        if (map.id === activeMapId) {
                            mapTitleInput.value = newTitle;
                            activeMapData.title = newTitle;
                            debouncedSaveMap();
                        } else {
                            // Quick sync to backend if we are renaming a non-active map
                            await fetch(`${API_BASE}/maps/${map.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title: newTitle })  // Send just enough to trigger title update on backend
                            });
                        }

                        inputEl.remove();
                        spanText.style.display = 'block';
                    };

                    inputEl.onblur = saveInlineRender;
                    inputEl.onkeypress = (ev) => { if (ev.key === 'Enter') inputEl.blur(); };
                };
            }

            mapListEl.appendChild(li);
        });
    } catch (error) {
        console.error('Error loading list:', error);
        showToast('Failed to load map list');
    }
}

// Restore Map Functionality
async function restoreMap(id) {
    try {
        await fetch(`${API_BASE}/maps/${id}/restore`, { method: 'PATCH' });
        showToast('Map restored successfully');
        loadMapList(); // Refresh the active tab automatically
    } catch (error) {
        console.error('Error restoring map:', error);
        showToast('Failed to restore map');
    }
}

// Create a new map
async function createNewMap() {
    try {
        const res = await fetch(`${API_BASE}/maps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const newMap = await res.json();
        await loadMapList();
        loadMap(newMap.id);
        showToast('New map created');
    } catch (error) {
        console.error('Error creating map:', error);
        showToast('Failed to create map');
    }
}

// Load a specific map
async function loadMap(id) {
    try {
        const res = await fetch(`${API_BASE}/maps/${id}`);
        const mapData = await res.json();

        activeMapId = id;
        activeMapData = mapData;

        // Reset History when loading a new map
        undoStack = [];
        redoStack = [];

        // Reset Canvas viewport
        scale = 1; translateX = 0; translateY = 0;
        updateCanvasTransform();

        // Wait a tick for bounding boxes to stabilize before drawing
        setTimeout(drawConnections, 50);

        // Update UI
        mapTitleInput.value = mapData.title;
        mapTitleInput.disabled = false;
        archiveMapBtn.disabled = false;
        exportImageBtn.disabled = false;

        document.querySelectorAll('.map-item').forEach(el => el.classList.remove('active'));
        loadMapList();

        renderMindMap();
        showToast('Map loaded');
    } catch (error) {
        console.error(`Error loading map ${id}:`, error);
        showToast('Failed to load map');
    }
}

mapTitleInput.addEventListener('input', () => {
    if (activeMapData) {
        activeMapData.title = mapTitleInput.value;
        debouncedSaveMap();
    }
});

// Save State to History Stack
function saveHistoryState() {
    if (!activeMapData) return;
    undoStack.push(JSON.stringify(activeMapData));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = []; // Clear redo when a new action is taken
}

// Perform Undo
function undoOperation() {
    if (undoStack.length === 0) return;

    // Save current to redo
    redoStack.push(JSON.stringify(activeMapData));

    // Pop undo and parse
    const prevState = undoStack.pop();
    activeMapData = JSON.parse(prevState);

    debouncedSaveMap();
    renderMindMap();
    showToast('Undo performed');
}

// Perform Redo
function redoOperation() {
    if (redoStack.length === 0) return;

    // Save current to undo
    undoStack.push(JSON.stringify(activeMapData));

    // Pop redo and parse
    const nextState = redoStack.pop();
    activeMapData = JSON.parse(nextState);

    debouncedSaveMap();
    renderMindMap();
    showToast('Redo performed');
}

// Debounced Auto-Save
function debouncedSaveMap() {
    clearTimeout(saveTimeout);

    autoSaveStatus.textContent = 'Saving...';
    autoSaveStatus.style.opacity = '1';

    saveTimeout = setTimeout(async () => {
        if (!activeMapId || !activeMapData) return;
        try {
            await fetch(`${API_BASE}/maps/${activeMapId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(activeMapData)
            });
            autoSaveStatus.textContent = 'Saved';
            setTimeout(() => { autoSaveStatus.style.opacity = '0'; }, 2000);
            loadMapList(); // Refresh titles seamlessly
        } catch (error) {
            console.error('Error saving map:', error);
            autoSaveStatus.textContent = 'Save Failed';
            showToast('Error saving data');
        }
    }, 1000); // 1-second debounce
}

// Archive a map
async function archiveMap() {
    if (!activeMapId) return;
    if (!confirm('Are you sure you want to archive this map? It will be removed from your list.')) return;

    try {
        await fetch(`${API_BASE}/maps/${activeMapId}`, { method: 'DELETE' });

        // Reset UI state
        activeMapId = null;
        activeMapData = null;
        rootContainer.innerHTML = '<div class="empty-state">Select or create a map to begin</div>';
        svgContainer.innerHTML = '';
        mapTitleInput.value = '';
        mapTitleInput.disabled = true;
        archiveMapBtn.disabled = true;
        exportImageBtn.disabled = true;

        loadMapList();
        showToast('Map archived');
    } catch (error) {
        console.error('Error archiving map:', error);
        showToast('Failed to archive map');
    }
}

// Recursive function to build a node and its children DOM elements
// Includes Drag and Drop reparenting logic
function buildNodeDom(nodeId) {
    const nodeData = activeMapData.nodes[nodeId];
    if (!nodeData) return null;

    const container = document.createElement('div');
    container.className = 'node-container';

    const nodeEl = document.createElement('div');
    nodeEl.className = 'node-content';
    nodeEl.id = `node-${nodeId}`;
    nodeEl.textContent = nodeData.text || 'Untitled Node';

    // Drag and Drop (DnD) setup
    nodeEl.draggable = true;

    nodeEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', nodeId);
        e.dataTransfer.effectAllowed = 'move';
        // Small timeout so the dragged ghost looks fine, while original dims
        setTimeout(() => { nodeEl.style.opacity = '0.4'; }, 0);
    });

    nodeEl.addEventListener('dragend', () => {
        nodeEl.style.opacity = '1';
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    nodeEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (nodeId !== e.dataTransfer.getData('text/plain')) {
            nodeEl.classList.add('drag-over');
        }
    });

    nodeEl.addEventListener('dragleave', () => {
        nodeEl.classList.remove('drag-over');
    });

    nodeEl.addEventListener('drop', (e) => {
        e.preventDefault();
        nodeEl.classList.remove('drag-over');

        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== nodeId) {
            // Prevent making a node a child of itself or its descendants (Cycle detection)
            if (isDescendant(draggedId, nodeId)) {
                showToast("Cannot move a parent node into its own child.");
                return;
            }

            // Detach from old parent
            detachFromParent(draggedId);

            saveHistoryState(); // Snapshot before structural mutation

            // Attach to new parent
            if (!activeMapData.nodes[nodeId].children) {
                activeMapData.nodes[nodeId].children = [];
            }
            activeMapData.nodes[nodeId].children.push(draggedId);

            debouncedSaveMap();
            renderMindMap();
        }
    });

    // Edit Node
    nodeEl.addEventListener('click', (e) => {
        // Only open if not panning
        if (Date.now() - panningEndTime < 100) return;
        e.stopPropagation();
        openNodeModal(nodeId);
    });

    container.appendChild(nodeEl);

    // Observe size changes
    resizeObserver.observe(nodeEl);

    // Render Children recursively
    if (nodeData.children && nodeData.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children-container';

        nodeData.children.forEach(childId => {
            const childDom = buildNodeDom(childId);
            if (childDom) childrenContainer.appendChild(childDom);
        });
        container.appendChild(childrenContainer);
    }

    return container;
}

// Tree cycle detection logic for DnD
function isDescendant(parentId, targetId) {
    const pNode = activeMapData.nodes[parentId];
    if (!pNode || !pNode.children) return false;
    if (pNode.children.includes(targetId)) return true;
    return pNode.children.some(childId => isDescendant(childId, targetId));
}

// Detach node from its parent
function detachFromParent(nodeId) {
    if (nodeId === activeMapData.root) return;
    for (const id in activeMapData.nodes) {
        const parent = activeMapData.nodes[id];
        if (parent.children && parent.children.includes(nodeId)) {
            parent.children = parent.children.filter(c => c !== nodeId);
            break;
        }
    }
}

// Render the entire map securely
function renderMindMap() {
    resizeObserver.disconnect();

    if (!activeMapData || !activeMapData.root) {
        rootContainer.innerHTML = '<div class="empty-state">No valid root node found.</div>';
        svgContainer.innerHTML = '';
        return;
    }

    rootContainer.innerHTML = '';
    const rootTree = buildNodeDom(activeMapData.root);
    if (rootTree) {
        rootContainer.appendChild(rootTree);
    }

    requestAnimationFrame(drawConnections);
}

// Draw the SVG Connectors dynamically
function drawConnections() {
    if (!activeMapData || !activeMapData.nodes) return;

    // Get the canvas container boundary so we can absolutely position SVG paths inside it.
    const containerRect = canvasContainer.getBoundingClientRect();

    // We adjust for scale so the paths match the mapped DOM size.
    let pathsHTML = '';

    const drawRecursive = (nodeId) => {
        const nodeData = activeMapData.nodes[nodeId];
        if (!nodeData || !nodeData.children) return;

        const parentEl = document.getElementById(`node-${nodeId}`);
        if (!parentEl) return;

        const pRect = parentEl.getBoundingClientRect();

        // Reverse engineer the scaled position relative to the UN-SCALED canvas container
        const startX = (pRect.left + pRect.width / 2 - containerRect.left) / scale;
        const startY = (pRect.bottom - containerRect.top) / scale;

        nodeData.children.forEach(childId => {
            const childEl = document.getElementById(`node-${childId}`);
            if (childEl) {
                const cRect = childEl.getBoundingClientRect();

                const endX = (cRect.left + cRect.width / 2 - containerRect.left) / scale;
                const endY = (cRect.top - containerRect.top) / scale;

                // Quadratic Bezier Curve flowchart styled exactly
                const midY = (startY + endY) / 2;
                pathsHTML += `
          <path d="M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}"
                fill="none" stroke="var(--line-color)" stroke-width="2" />
          <polygon points="${endX - 5},${endY - 6} ${endX + 5},${endY - 6} ${endX},${endY}" fill="var(--line-color)" />
        `;
            }

            drawRecursive(childId);
        });
    };

    drawRecursive(activeMapData.root);
    svgContainer.innerHTML = pathsHTML;
}

let panningEndTime = 0;

/* Infinite Canvas: Pan and Zoom */
function updateCanvasTransform() {
    canvasContainer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    drawConnections(); // Re-draw SVGs precisely on zoom so arrows don't detach
}

canvasWrapper.addEventListener('mousedown', (e) => {
    // Ignore if clicking a node
    if (e.target.closest('.node-content')) return;
    isPanning = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
});

window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateCanvasTransform();
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        panningEndTime = Date.now();
    }
});

canvasWrapper.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) {
        // Optional: Standard scroll up/down panning
        translateY -= e.deltaY;
        translateX -= e.deltaX;
        updateCanvasTransform();
        return;
    }

    // CTRL + Scroll zoom
    e.preventDefault();
    const zoomFactor = 0.05;
    const direction = e.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(Math.max(0.2, scale + direction * zoomFactor), 3);

    scale = newScale;
    updateCanvasTransform();
}, { passive: false });

/* Modal Operations */
function openNodeModal(nodeId) {
    activeNodeId = nodeId;
    const nodeData = activeMapData.nodes[nodeId];

    nodeTextInput.value = nodeData.text || '';

    if (nodeId === activeMapData.root) {
        deleteNodeBtn.style.display = 'none';
    } else {
        deleteNodeBtn.style.display = 'block';
    }

    modal.classList.add('visible');
    nodeTextInput.focus();
}

function closeNodeModal() {
    modal.classList.remove('visible');
    activeNodeId = null;
}

function updateNodeText() {
    if (!activeNodeId) return;

    const textVal = nodeTextInput.value.trim() || 'Untitled Node';

    // Only save history if text actually changed
    if (activeMapData.nodes[activeNodeId].text !== textVal) {
        saveHistoryState();
    }

    activeMapData.nodes[activeNodeId].text = textVal;

    // GRANULAR DOM UPDATE: Instead of a full map redraw, just update DOM node's text and save
    const nodeEl = document.getElementById(`node-${activeNodeId}`);
    if (nodeEl) {
        nodeEl.textContent = textVal;
    }

    debouncedSaveMap();
    closeNodeModal();
}

function addChildNode() {
    if (!activeNodeId) return;

    const newChildId = generateId();
    activeMapData.nodes[newChildId] = {
        text: "New Branch",
        children: []
    };

    saveHistoryState();

    if (!activeMapData.nodes[activeNodeId].children) {
        activeMapData.nodes[activeNodeId].children = [];
    }
    activeMapData.nodes[activeNodeId].children.push(newChildId);

    debouncedSaveMap();
    // Full re-render needed when structural nodes change
    renderMindMap();
    openNodeModal(newChildId);
}

function deleteNodeRecursive(nodeId) {
    const nodeData = activeMapData.nodes[nodeId];
    if (!nodeData) return;
    if (nodeData.children) {
        nodeData.children.forEach(childId => deleteNodeRecursive(childId));
    }
    delete activeMapData.nodes[nodeId];
}

function deleteActiveNode() {
    if (!activeNodeId || activeNodeId === activeMapData.root) return;

    saveHistoryState();

    detachFromParent(activeNodeId);
    deleteNodeRecursive(activeNodeId);

    debouncedSaveMap();
    renderMindMap();
    closeNodeModal();
}

// Export Map as High-Res PNG Image
async function exportImage() {
    if (!activeMapId || typeof html2canvas === 'undefined') return;

    const originalScale = scale;
    const originalTx = translateX;
    const originalTy = translateY;

    // 1. Reset viewport to native 1:1 scale for a sharp, unskewed capture
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateCanvasTransform();

    // 2. Measure the true size of the drawn map structure
    // We add 150px padding to give the exported flowchart some breathing room
    await new Promise(r => setTimeout(r, 50)); // let flexbox paint
    const rect = rootContainer.getBoundingClientRect();
    const requiredWidth = rect.width + 150;
    const requiredHeight = Math.max(rect.height + 150, canvasWrapper.clientHeight);

    // 3. Temporarily expand the container layer so html2canvas doesn't crop large maps
    const originalWidth = canvasContainer.style.width;
    const originalHeight = canvasContainer.style.height;

    canvasContainer.style.width = requiredWidth + 'px';
    canvasContainer.style.height = requiredHeight + 'px';

    // The SVGs map 1:1 to canvasContainer layout, so structural resize requires redrawing connections
    drawConnections();

    // Give the browser one more tick to paint the new SVG paths onto the expanded layout
    await new Promise(r => setTimeout(r, 100));

    try {
        showToast('Capturing map...');

        // 4. Capture the expanded virtual canvas
        const canvas = await window.html2canvas(canvasContainer, {
            backgroundColor: '#f8fafc', // match CSS --bg-color
            scale: 2, // 2x DPI for crisp text
            logging: false,
            width: requiredWidth,
            height: requiredHeight,
            x: 0,
            y: 0
        });

        // 5. Trigger synthetic download link
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;

        const safeTitle = (activeMapData.title || 'Untitled Map').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${safeTitle}.png`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast('Image exported successfully');
    } catch (error) {
        console.error('Error exporting image:', error);
        showToast('Failed to export image');
    } finally {
        // 6. Restore original dimensions and user viewport seamlessly
        canvasContainer.style.width = originalWidth;
        canvasContainer.style.height = originalHeight;

        scale = originalScale;
        translateX = originalTx;
        translateY = originalTy;
        updateCanvasTransform();
    }
}

// Hook bindings
newMapBtn.onclick = createNewMap;
archiveMapBtn.onclick = archiveMap;
exportImageBtn.onclick = exportImage;

cancelBtn.onclick = closeNodeModal;
saveNodeBtn.onclick = updateNodeText;
addChildBtn.onclick = addChildNode;
deleteNodeBtn.onclick = deleteActiveNode;

nodeTextInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') updateNodeText();
});

// Keyboard Shortcuts (Undo / Redo)
window.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT') return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
            redoOperation(); // CTRL+SHIFT+Z
        } else {
            undoOperation(); // CTRL+Z
        }
        e.preventDefault();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        redoOperation(); // CTRL+Y
        e.preventDefault();
    }
});

// Tab Switch Logic
tabActive.onclick = () => {
    currentTab = 'active';
    tabActive.classList.add('active');
    tabArchived.classList.remove('active');
    loadMapList();
};

tabArchived.onclick = () => {
    currentTab = 'archived';
    tabArchived.classList.add('active');
    tabActive.classList.remove('active');
    loadMapList();
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadMapList();
});
