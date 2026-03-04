const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const MAPS_DIR = path.join(__dirname, 'maps');
const INDEX_FILE = path.join(MAPS_DIR, 'index.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure maps directory exists
if (!fs.existsSync(MAPS_DIR)) {
  fs.mkdirSync(MAPS_DIR);
}

// Ensure index.json exists
if (!fs.existsSync(INDEX_FILE)) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify([]));
  // Migration for any preexisting files (if this server ran before index.json was added)
  const files = fs.readdirSync(MAPS_DIR);
  const maps = [];
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'index.json') {
      try {
        const filePath = path.join(MAPS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const mapData = JSON.parse(content);
        maps.push({
          id: file.replace('.json', ''),
          title: mapData.title || 'Untitled Mind Map'
        });
      } catch (e) {
        // ignore
      }
    }
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(maps, null, 2));
}

// Helpers
const generateId = () => crypto.randomUUID();

const atomicWrite = (filePath, contentStr) => {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, contentStr);
  fs.renameSync(tmpPath, filePath); // Atomic replacement
};

const updateIndex = (mapsList) => {
  atomicWrite(INDEX_FILE, JSON.stringify(mapsList, null, 2));
};

// GET /api/maps - List all maps (only unarchived)
app.get('/api/maps', (req, res) => {
  try {
    const content = fs.readFileSync(INDEX_FILE, 'utf8');
    const indexContent = JSON.parse(content);
    // Filter out logically deleted maps from the UI list
    const visibleMaps = indexContent.filter(map => !map.archived);
    res.json(visibleMaps);
  } catch (error) {
    console.error('Error reading maps index:', error);
    res.status(500).json({ error: 'Failed to list maps' });
  }
});

// GET /api/maps/archived - List all archived maps
app.get('/api/maps/archived', (req, res) => {
  try {
    const content = fs.readFileSync(INDEX_FILE, 'utf8');
    const indexContent = JSON.parse(content);
    const archivedMaps = indexContent.filter(map => map.archived);
    res.json(archivedMaps);
  } catch (error) {
    console.error('Error reading maps index:', error);
    res.status(500).json({ error: 'Failed to list archived maps' });
  }
});

// GET /api/maps/:id - Load specific map
app.get('/api/maps/:id', (req, res) => {
  const mapId = req.params.id;
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Map not found' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(content));
  } catch (error) {
    console.error(`Error reading map ${mapId}:`, error);
    res.status(500).json({ error: 'Failed to read map' });
  }
});

app.get('/api/default', (req, res) => {
  const rootId = 'root_' + generateId();
  const defaultMap = {
    title: "New Mind Map",
    root: rootId,
    nodes: {
      [rootId]: {
        text: "Central Idea",
        children: []
      }
    }
  };
  res.json(defaultMap);
});

// POST /api/maps - Create new map
app.post('/api/maps', (req, res) => {
  const mapId = generateId();
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);

  const body = req.body;
  const rootId = 'root_' + generateId();

  const mapData = {
    title: body.title || "New Mind Map",
    root: body.root || rootId,
    nodes: body.nodes || {
      [rootId]: {
        text: "Central Idea",
        children: []
      }
    }
  };

  try {
    atomicWrite(filePath, JSON.stringify(mapData, null, 2));

    // Update Index
    const indexContent = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    indexContent.push({ id: mapId, title: mapData.title });
    updateIndex(indexContent);

    res.status(201).json({ id: mapId, ...mapData });
  } catch (error) {
    console.error('Error creating map:', error);
    res.status(500).json({ error: 'Failed to create map' });
  }
});

// PUT /api/maps/:id - Update existing map
app.put('/api/maps/:id', (req, res) => {
  const mapId = req.params.id;
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Map not found' });
  }

  try {
    const updatedMap = req.body;
    atomicWrite(filePath, JSON.stringify(updatedMap, null, 2));

    // Update index title if changed
    const indexContent = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const mapEntry = indexContent.find(m => m.id === mapId);
    if (mapEntry && mapEntry.title !== updatedMap.title) {
      mapEntry.title = updatedMap.title;
      updateIndex(indexContent);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`Error updating map ${mapId}:`, error);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// DELETE /api/maps/:id - Logical Delete (Archive)
app.delete('/api/maps/:id', (req, res) => {
  const mapId = req.params.id;
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);

  if (fs.existsSync(filePath)) {
    try {
      // Rather than unlinkSync, we just update the metadata index to archived
      let indexContent = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const mapEntry = indexContent.find(m => m.id === mapId);

      if (mapEntry) {
        mapEntry.archived = true;
        updateIndex(indexContent);
      }

      res.json({ success: true, message: 'Map safely archived' });
    } catch (error) {
      console.error('Error archiving map:', error);
      res.status(500).json({ error: 'Failed to archive map' });
    }
  } else {
    res.status(404).json({ error: 'Map not found' });
  }
});

// PATCH /api/maps/:id/restore - Restore an archived map
app.patch('/api/maps/:id/restore', (req, res) => {
  const mapId = req.params.id;
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);

  if (fs.existsSync(filePath)) {
    try {
      let indexContent = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const mapEntry = indexContent.find(m => m.id === mapId);

      if (mapEntry) {
        mapEntry.archived = false;
        updateIndex(indexContent);
      }

      res.json({ success: true, message: 'Map restored successfully' });
    } catch (error) {
      console.error('Error restoring map:', error);
      res.status(500).json({ error: 'Failed to restore map' });
    }
  } else {
    res.status(404).json({ error: 'Map not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Mind Map server running on http://localhost:${PORT}`);
});
