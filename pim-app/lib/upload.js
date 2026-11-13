// Upload targets. Two kinds cover every service the user named:
//  - folder: any path Windows can write to. FRITZ!NAS and TrueNAS via SMB (\\fritz.nas\FRITZ.NAS),
//    iCloud Drive, Dropbox, Google Drive and OneDrive via their desktop sync folders.
//  - webdav: HTTP PUT, e.g. TrueNAS/Nextcloud WebDAV share or MyFRITZ online storage.
// shortcut: no native Dropbox/Google/iCloud API (OAuth). Sync folders need the vendor's desktop client; add APIs if users lack it.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

function counter(onBytes) {
  return new Transform({ transform(chunk, _enc, cb) { onBytes(chunk.length); cb(null, chunk); } });
}

// "foto.jpg" -> "foto (1).jpg", "foto (2).jpg", ... until exists(name) is false. Never overwrites.
async function freeName(name, exists) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 1000; i++) {
    const candidate = i ? `${base} (${i})${ext}` : name;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Kein freier Dateiname gefunden');
}

function basicAuth(user, pass) {
  return user ? { Authorization: 'Basic ' + Buffer.from(`${user}:${pass || ''}`).toString('base64') } : {};
}

function davUrl(base, name) {
  const u = new URL(base);
  if (!/^https?:$/.test(u.protocol)) throw new Error('WebDAV-Adresse muss mit http:// oder https:// beginnen');
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return new URL(encodeURIComponent(name), u).toString();
}

// Uploads one file. onProgress(sentBytes, totalBytes). Resolves to { name, location }.
async function uploadFile(file, target, pass, onProgress = () => {}) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) throw new Error('Nur Dateien, keine Ordner');
  let sent = 0;
  const tick = n => { sent += n; onProgress(sent, stat.size); };

  if (target.type === 'folder') {
    const dir = target.path;
    await fs.promises.access(dir, fs.constants.W_OK);
    const name = await freeName(path.basename(file), n => fs.promises.access(path.join(dir, n)).then(() => true, () => false));
    const dest = path.join(dir, name);
    try {
      await pipeline(fs.createReadStream(file), counter(tick), fs.createWriteStream(dest, { flags: 'wx' }));
    } catch (e) {
      await fs.promises.rm(dest, { force: true }); // no half-written file left on the NAS
      throw e;
    }
    return { name, location: dest };
  }

  if (target.type === 'webdav') {
    const auth = basicAuth(target.user, pass);
    const name = await freeName(path.basename(file), async n => {
      const r = await fetch(davUrl(target.url, n), { method: 'HEAD', headers: auth });
      return r.ok;
    });
    const url = davUrl(target.url, name);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...auth, 'Content-Length': String(stat.size) },
      body: fs.createReadStream(file).pipe(counter(tick)),
      duplex: 'half',
    });
    if (!res.ok) throw new Error(`Server antwortet ${res.status} ${res.statusText}`);
    return { name, location: url };
  }

  throw new Error(`Unbekannter Speichertyp: ${target.type}`);
}

// Quick reachability check for the settings form.
async function testTarget(target, pass) {
  if (target.type === 'folder') {
    await fs.promises.access(target.path, fs.constants.W_OK);
    return 'Ordner erreichbar und beschreibbar';
  }
  const r = await fetch(davUrl(target.url, ''), { method: 'PROPFIND', headers: { ...basicAuth(target.user, pass), Depth: '0' } });
  if (r.status === 207 || r.ok) return 'WebDAV erreichbar';
  if (r.status === 401) throw new Error('Benutzername oder Passwort falsch');
  throw new Error(`Server antwortet ${r.status}`);
}

// Suggestions for the "Speicher" form. `exists` tells the UI whether the folder was found on this PC.
function presets() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  let dropbox = path.join(home, 'Dropbox');
  try { dropbox = JSON.parse(fs.readFileSync(path.join(local, 'Dropbox', 'info.json'), 'utf8')).personal.path || dropbox; } catch { /* default path */ }
  const gdrive = ['G:\\Meine Ablage', 'G:\\My Drive'].find(p => fs.existsSync(p)) || 'G:\\Meine Ablage';
  const list = [
    { id: 'fritz', name: 'FRITZ!NAS', type: 'folder', path: '\\\\fritz.nas\\FRITZ.NAS', hint: 'SMB-Freigabe der FRITZ!Box. Ggf. Unterordner anhängen.' },
    { id: 'truenas', name: 'TrueNAS', type: 'folder', path: '\\\\truenas.local\\share', hint: 'SMB-Freigabe. Freigabename anpassen.' },
    { id: 'truenas-dav', name: 'TrueNAS (WebDAV)', type: 'webdav', url: 'http://truenas.local:8080/share/', hint: 'WebDAV-Dienst in TrueNAS aktivieren.' },
    { id: 'icloud', name: 'iCloud Drive', type: 'folder', path: path.join(home, 'iCloudDrive'), hint: 'Braucht iCloud für Windows.' },
    { id: 'dropbox', name: 'Dropbox', type: 'folder', path: dropbox, hint: 'Braucht die Dropbox-App.' },
    { id: 'gdrive', name: 'Google Drive', type: 'folder', path: gdrive, hint: 'Braucht Google Drive für Desktop.' },
    { id: 'onedrive', name: 'OneDrive', type: 'folder', path: process.env.OneDrive || path.join(home, 'OneDrive'), hint: '' },
    { id: 'custom', name: 'Eigener Ordner', type: 'folder', path: '', hint: '' },
    { id: 'webdav', name: 'WebDAV', type: 'webdav', url: 'https://', hint: 'Z. B. Nextcloud oder MyFRITZ-Onlinespeicher.' },
  ];
  // UNC paths are not probed: a missing NAS would block for many seconds.
  return list.map(p => ({ ...p, exists: p.type === 'folder' && p.path && !p.path.startsWith('\\\\') ? fs.existsSync(p.path) : null }));
}

module.exports = { uploadFile, testTarget, presets, freeName, davUrl };
