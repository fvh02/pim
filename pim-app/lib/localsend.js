// Send files to phones with LocalSend (https://localsend.org, protocol v2): devices announce themselves by UDP
// multicast on 224.0.0.167:53317; files go over HTTPS to the phone, which asks its user to accept.
// The phone's certificate is self-signed: Pim checks it against the fingerprint the phone announced.
const dgram = require('dgram');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');

const GROUP = '224.0.0.167', PORT = 53317, API = '/api/localsend/v2';
const FORGET_MS = 10 * 60 * 1000; // devices that stayed silent this long drop out of the list

function info(fingerprint) {
  return { alias: `Pim (${os.hostname()})`, version: '2.1', deviceModel: 'Windows', deviceType: 'desktop', fingerprint, port: PORT, protocol: 'https', download: false };
}

// Discovery: listen to announcements and announce ourselves, so open LocalSend apps answer.
function discover(fingerprint, onDevices) {
  const devices = new Map(); // fingerprint -> device
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const publish = () => onDevices([...devices.values()].sort((a, b) => a.alias.localeCompare(b.alias)));
  sock.on('message', (buf, rinfo) => {
    let m;
    try { m = JSON.parse(buf.toString('utf8')); } catch { return; }
    if (!m || !m.fingerprint || m.fingerprint === fingerprint || typeof m.alias !== 'string') return;
    const d = { fingerprint: m.fingerprint, alias: m.alias.slice(0, 60), model: m.deviceModel || '', type: m.deviceType || '', ip: rinfo.address, port: +m.port || PORT, protocol: m.protocol === 'http' ? 'http' : 'https', seen: Date.now() };
    const old = devices.get(d.fingerprint);
    devices.set(d.fingerprint, d);
    if (!old || old.ip !== d.ip || old.alias !== d.alias) publish();
  });
  sock.on('error', () => { /* port in use or no network: no phones, nothing else breaks */ });
  const announce = () => {
    const msg = Buffer.from(JSON.stringify({ ...info(fingerprint), announce: true }));
    try { sock.send(msg, PORT, GROUP); } catch { /* not bound yet */ }
  };
  sock.bind(PORT, () => {
    try { sock.addMembership(GROUP); sock.setMulticastTTL(1); } catch { /* no multicast interface */ }
    announce();
  });
  const timer = setInterval(() => {
    announce();
    let changed = false;
    for (const [k, d] of devices) if (Date.now() - d.seen > FORGET_MS) { devices.delete(k); changed = true; }
    if (changed) publish();
  }, 30000);
  return { stop() { clearInterval(timer); try { sock.close(); } catch { /* closed */ } }, announce };
}

const norm = f => String(f || '').replace(/:/g, '').toLowerCase();

// HTTPS: a fresh connection per request (agent: false, no reused sockets), and nothing is sent before the
// phone's certificate matched the fingerprint it announced.
function request(dev, method, pathAndQuery, body, headers = {}, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const tls = dev.protocol !== 'http';
    const req = (tls ? https : http).request({ host: dev.ip, port: dev.port, method, path: pathAndQuery, headers, timeout, agent: false, rejectUnauthorized: false }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('Keine Antwort vom Handy')));
    req.on('error', reject);
    const write = () => { if (body && typeof body.pipe === 'function') body.pipe(req); else req.end(body); };
    if (!tls) return write();
    req.on('socket', sock => sock.once('secureConnect', () => {
      if (norm(sock.getPeerCertificate().fingerprint256) !== norm(dev.fingerprint)) return req.destroy(new Error('Zertifikat passt nicht zum Gerät')); // someone else answers on that IP
      write();
    }));
  });
}

// Sends files to one device. onProgress(sent, total). Rejects with a German message.
async function send(dev, fingerprint, files, onProgress = () => {}) {
  const meta = {};
  let total = 0;
  for (const f of files) {
    const st = await fs.promises.stat(f);
    if (!st.isFile()) throw new Error('Nur Dateien, keine Ordner');
    const id = crypto.randomUUID();
    meta[id] = { id, fileName: path.basename(f), size: st.size, fileType: 'application/octet-stream', path: f };
    total += st.size;
  }
  const payload = JSON.stringify({ info: info(fingerprint), files: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { id: v.id, fileName: v.fileName, size: v.size, fileType: v.fileType }])) });
  const prep = await request(dev, 'POST', `${API}/prepare-upload`, payload, { 'Content-Type': 'application/json' });
  if (prep.status === 204) return; // nothing to send
  if (prep.status === 403) throw new Error('Am Handy abgelehnt');
  if (prep.status === 409) throw new Error('Handy ist gerade beschäftigt');
  if (prep.status !== 200) throw new Error(`Handy antwortet ${prep.status}`);
  const { sessionId, files: tokens } = JSON.parse(prep.body);
  let sent = 0;
  for (const [id, m] of Object.entries(meta)) {
    if (!tokens || !tokens[id]) continue; // the user deselected this file on the phone
    // counting Transform buffers until the request pipes it (a 'data' listener would start reading too early)
    const stream = fs.createReadStream(m.path).pipe(new Transform({ transform(c, _e, cb) { sent += c.length; onProgress(sent, total); cb(null, c); } }));
    const q = new URLSearchParams({ sessionId, fileId: id, token: tokens[id] });
    const r = await request(dev, 'POST', `${API}/upload?${q}`, stream, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(m.size) }, 600000);
    if (r.status !== 200) throw new Error(`Übertragung abgebrochen (${r.status})`);
  }
}

module.exports = { discover, send, info, norm };
