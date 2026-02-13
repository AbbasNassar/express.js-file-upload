const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    // Prefer a client-supplied publicId (user id) so uploaded files can be
    // retrieved by user id. Fall back to a timestamped random name when not
    // provided.
    try {
      const publicId = req.body && req.body.publicId ? String(req.body.publicId) : null;
      if (publicId) {
        // Keep the extension and use publicId as filename. This will overwrite
        // any previous file for the same publicId, which is usually desired
        // for profile pictures.
        const safeId = publicId.replace(/[^a-zA-Z0-9-_\.]/g, '_');
        cb(null, `${safeId}${ext}`);
        return;
      }
    } catch (e) {
      // ignore and fallback to random name
    }

    const name = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, name);
  }
});

const upload = multer({ storage: storage });

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Build a fully-qualified URL so clients (emulator/device) can use it
  // directly. Use the request's protocol and host header so the returned
  // URL matches how the client reached the server.
  const filename = req.file.filename;
  const protocol = req.protocol; // http
  const host = req.get('host'); // e.g. 10.0.2.2:3000 or localhost:3000
  const fullUrl = `${protocol}://${host}/uploads/${filename}`;

  console.log(`Uploaded file saved: ${req.file.path} -> ${fullUrl}`);

  res.json({ url: fullUrl, filename: filename });
});

// Debug: list uploaded files
app.get('/uploads/list', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    // Return file names and a sample URL for each
    const protocol = req.protocol;
    const host = req.get('host');
    const list = files.map((f) => ({
      filename: f,
      url: `${protocol}://${host}/uploads/${f}`,
    }));
    res.json({ count: list.length, files: list });
  } catch (err) {
    console.error('Error listing uploads:', err);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// Root index / health check — helps when you open http://localhost:3000
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Upload Server</title></head>
      <body>
        <h2>Local Upload Server</h2>
        <p>Endpoints:</p>
        <ul>
          <li><a href="/uploads/list">/uploads/list</a> — list uploaded files (JSON)</li>
          <li><form method="post" enctype="multipart/form-data" action="/upload"><input type="file" name="file"/><button type="submit">Upload</button></form></li>
        </ul>
      </body>
    </html>
  `);
});

// Avoid browser 404 noise for favicon requests by returning 204 No Content.
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

const os = require('os');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Upload server listening on port ${PORT}`);

  // Print all IPv4 addresses so you can reach the server from devices/emulator
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log('Accessible addresses:');
  console.log(`  http://localhost:${PORT}`);
  addresses.forEach((a) => console.log(`  http://${a}:${PORT}`));
  console.log('For Android emulator use http://10.0.2.2:3000');
});
