import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import './App.css';

const API_URL = "https://chronos-vault-backend.vercel.app";

// ==========================================
// CLIENT-SIDE ENCRYPTION (AES-256)
// ==========================================
function deriveKey(password, salt) {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 10000
  }).toString();
}

function encryptSecret(secret, password) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
  const key = deriveKey(password, salt);
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  const encrypted = CryptoJS.AES.encrypt(secret, CryptoJS.enc.Hex.parse(key), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return salt + ':' + iv.toString() + ':' + encrypted.toString();
}

function decryptSecret(encryptedData, password) {
  try {
    const [salt, ivHex, encrypted] = encryptedData.split(':');
    const key = deriveKey(password, salt);
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Hex.parse(key), {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8) || '[DECRYPTION_FAILED]';
  } catch (e) {
    return '[DECRYPTION_FAILED]';
  }
}

// ==========================================
// MATRIX RAIN
// ==========================================
const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const chars = "01アイウエカキクコサシスセタチツテトナニ$#@%&*<>{}[]ヴヲン";
    const fontSize = 13;
    let cols = Math.floor(canvas.width / fontSize);
    let drops = Array(cols).fill(1);
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSize + "px monospace";
      for (let i = 0; i < drops.length; i++) {
        ctx.fillStyle = Math.random() > 0.97 ? "#cfffcf" : "#00ff41";
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const interval = setInterval(draw, 38);
    const onResize = () => { resize(); cols = Math.floor(canvas.width / fontSize); drops = Array(cols).fill(1); };
    window.addEventListener('resize', onResize);
    return () => { clearInterval(interval); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={canvasRef} className="matrix-canvas" />;
};

// ==========================================
// WIREFRAME CUBE
// ==========================================
const WireframeCube = ({ size = 150, speed = 0.011 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const s = size * 0.34;
    const baseVerts = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(v => v.map(c => c * s));
    const diagEdges = [[0, 6], [1, 7], [2, 4], [3, 5], [0, 5], [1, 4], [2, 7], [3, 6], [0, 7], [3, 4]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7], ...diagEdges];
    let ay = 0, ax = 0.35, az = 0;
    const cx = size / 2, cy = size / 2;
    const rotY = (v, a) => [v[0] * Math.cos(a) - v[2] * Math.sin(a), v[1], v[0] * Math.sin(a) + v[2] * Math.cos(a)];
    const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
    const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
    const project = v => { const fov = size * 1.9, z = v[2] + size * 1.5; return [cx + v[0] * fov / z, cy + v[1] * fov / z, v[2]]; };
    let animId;
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      ay += speed; az += speed * 0.3;
      const tv = baseVerts.map(v => rotZ(rotX(rotY(v, ay), ax), az));
      const pv = tv.map(v => project(v));
      edges.forEach(([a, b], ei) => {
        const isDiag = ei >= 12;
        const depth = ((tv[a][2] + tv[b][2]) / (2 * s * 2)) + 0.5;
        const alpha = (0.25 + depth * 0.65).toFixed(2);
        ctx.beginPath(); ctx.moveTo(pv[a][0], pv[a][1]); ctx.lineTo(pv[b][0], pv[b][1]);
        ctx.strokeStyle = `rgba(0,255,65,${alpha})`; ctx.lineWidth = isDiag ? 0.5 : 1.3; ctx.stroke();
      });
      pv.forEach((p, i) => {
        const depth = (tv[i][2] / (s * 2)) + 0.5;
        const r = depth > 0.65 ? 3.5 : depth > 0.35 ? 2.2 : 1.4;
        const alpha = (0.35 + depth * 0.65).toFixed(2);
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,65,${alpha})`; ctx.fill();
        if (depth > 0.6) { ctx.beginPath(); ctx.arc(p[0], p[1], r + 3, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,255,65,0.15)'; ctx.lineWidth = 1; ctx.stroke(); }
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [size, speed]);
  return <canvas ref={canvasRef} width={size} height={size} className="cube-canvas" style={{ width: size, height: size }} />;
};

// ==========================================
// BOOT SCREEN
// ==========================================
const bootLines = [
  'BIOS v3.1.0 ........ OK',
  'RAM 131072KB ....... OK',
  'CRYPTO ENGINE ...... AES-256-CBC',
  'PBKDF2 MODULE ...... LOADED',
  'VAULT DRIVER ....... LOADED',
  'MATRIX SUBSYSTEM ... ACTIVE',
  'NETWORK STACK ...... ONLINE',
  'AUTH MODULE ........ READY',
  'CHRONOS_VAULT OS ... BOOT COMPLETE'
];

const BootScreen = ({ onComplete }) => {
  const [lines, setLines] = useState([]);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let i = 0;
    const next = () => {
      if (i >= bootLines.length) { setTimeout(onComplete, 300); return; }
      setLines(prev => [...prev, bootLines[i]]);
      setProgress(((i + 1) / bootLines.length) * 100);
      i++; setTimeout(next, 155 + Math.random() * 90);
    };
    next();
  }, [onComplete]);
  return (
    <div className="boot-seq">
      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: '1.1rem', fontWeight: 900, letterSpacing: '8px', color: '#00ff41', marginBottom: '22px' }}>CHRONOS_VAULT</div>
      <div>{lines.map((line, i) => <div key={i} className="boot-line" style={{ color: i === lines.length - 1 && i === bootLines.length - 1 ? '#00ff41' : 'rgba(0,255,65,0.55)' }}>{'> ' + line}</div>)}</div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: progress + '%' }} /></div>
    </div>
  );
};

// ==========================================
// CLOCK
// ==========================================
const Clock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const d = n.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      const t = n.toTimeString().slice(0, 8);
      setTime(`${d} — ${t}`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  return <span className="clock-display">{time}</span>;
};

// ==========================================
// MAIN APP
// ==========================================
function App() {
  const [booted, setBooted] = useState(false);
  const [authMode, setAuthMode] = useState('LOGIN');
  const [user, setUser] = useState(null);
  const [vault, setVault] = useState([]);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', heir_email: '', switch_days: 30 });
  const [entry, setEntry] = useState({ site: '', secret: '' });
  const [authErr, setAuthErr] = useState('');
  const [vaultErr, setVaultErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState({});
  const [userPassword, setUserPassword] = useState(''); // For decryption
  const [nodeId] = useState('CV-' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0'));

  const isRegister = authMode !== 'LOGIN';

  const fetchVault = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/get-vault/${id}`);
      setVault(res.data);
    } catch (_) { }
  };

  const switchMode = (mode) => {
    setAuthMode(mode);
    setAuthErr('');
    setFormData({ username: '', email: '', password: '', heir_email: '', switch_days: 30 });
  };

  const handleAuth = async () => {
    if (!formData.email || !formData.password) { setAuthErr('> MISSING_CREDENTIALS'); return; }
    setLoading(true); setAuthErr('');
    try {
      if (!isRegister) {
        // LOGIN
        const res = await axios.post(`${API_URL}/login`, {
          email: formData.email,
          password: formData.password
        });
        setUser(res.data.user);
        setUserPassword(formData.password); // Store for decryption
        fetchVault(res.data.user.id);
      } else {
        // REGISTER
        if (!formData.username) { setAuthErr('> NODE_ID_REQUIRED'); setLoading(false); return; }
        if (!formData.heir_email) { setAuthErr('> HEIR_EMAIL_REQUIRED'); setLoading(false); return; }
        await axios.post(`${API_URL}/register`, {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          heir_email: formData.heir_email,
          switch_days: formData.switch_days
        });
        switchMode('LOGIN');
        setTimeout(() => setAuthErr('> REGISTRATION_SUCCESS'), 50);
      }
    } catch (e) {
      setAuthErr('> ' + (e.response?.data?.error || 'AUTH_FAILED').toUpperCase());
    }
    setLoading(false);
  };

  const handleEncrypt = async () => {
    if (!entry.site || !entry.secret) { setVaultErr('> MISSING_FIELDS'); return; }
    setVaultErr('');
    try {
      // Client-side encrypt karo before sending
      const encryptedSecret = encryptSecret(entry.secret, userPassword);
      await axios.post(`${API_URL}/add-secret`, {
        user_id: user.id,
        site_name: entry.site,
        secret_content: encryptedSecret
      });
      setEntry({ site: '', secret: '' });
      fetchVault(user.id);
    } catch (e) {
      setVaultErr('> ' + (e.response?.data?.error || 'ENCRYPT_FAILED').toUpperCase());
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/delete-secret/${id}`);
      fetchVault(user.id);
    } catch (e) { }
  };

  const handleUpdateSwitchDays = async (days) => {
    try {
      await axios.post(`${API_URL}/update-switch-days`, {
        user_id: user.id,
        switch_days: days
      });
      setUser({ ...user, dead_man_switch_days: days });
    } catch (e) { }
  };

  const toggleSecret = (id) => {
    setShowSecret(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDecryptedSecret = (encryptedData) => {
    return decryptSecret(encryptedData, userPassword);
  };

  const handleLogout = () => {
    setUser(null);
    setVault([]);
    setAuthMode('LOGIN');
    setUserPassword('');
    setShowSecret({});
  };

  useEffect(() => {
    const onKey = e => { if (e.key === 'Enter' && !user) handleAuth(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formData, authMode, user]);

  if (!booted) return (
    <div className="os-shell">
      <MatrixRain />
      <div className="scan-line" />
      <BootScreen onComplete={() => setBooted(true)} />
    </div>
  );

  return (
    <div className="os-shell">
      <MatrixRain />
      <div className="scan-line" />
      <div className="vignette" />

      <header className="os-header">
        <h1 className="glitch-logo">CHRONOS_VAULT</h1>
        <div className="header-right">
          {user && <button className="disconnect-btn" onClick={handleLogout}>DISCONNECT</button>}
        </div>
      </header>

      <main className="viewport">
        {!user ? (
          <div className="auth-layout">
            {/* LEFT: CUBE */}
            <div className="cube-section">
              <div className="cube-canvas-wrap"><WireframeCube size={150} speed={0.011} /></div>
              <div className="cube-tag">ENCRYPT_ENGINE</div>
              <div className="sys-stats">
                <div className="stat-row"><span className="stat-lbl">CRYPTO</span><span className="stat-val">AES-256</span></div>
                <div className="stat-bar"><div className="stat-fill" style={{ width: '90%' }} /></div>
                <div className="stat-row"><span className="stat-lbl">STATUS</span><span className="stat-val">ONLINE</span></div>
                <div className="stat-bar"><div className="stat-fill" style={{ width: '100%', animationDelay: '0.3s' }} /></div>
                <div className="stat-row"><span className="stat-lbl">NODE</span><span className="stat-val">{nodeId}</span></div>
                <div className="stat-bar"><div className="stat-fill" style={{ width: '70%', animationDelay: '0.6s' }} /></div>
              </div>
            </div>

            <div className="connector" />

            {/* RIGHT: AUTH CARD */}
            <div className="auth-card">
              <div className="scan-line-anim" />
              <div className="panel-title">{isRegister ? 'REGISTER_PROTOCOL' : 'ACCESS_PROTOCOL'}</div>
              <div className="panel-subtitle">{isRegister ? 'CREATE NEW IDENTITY' : 'LOGIN TO CHRONOS VAULT'}</div>
              <div className="panel-divider" />

              {isRegister && (
                <div className="input-wrap">
                  <span className="input-icon">@</span>
                  <input className="cv-input" type="text" placeholder="NODE_IDENTIFIER"
                    autoComplete="off" value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })} />
                </div>
              )}

              <div className="input-wrap">
                <span className="input-icon">✉</span>
                <input className="cv-input" type="email" placeholder="EMAIL_ADDRESS"
                  autoComplete="off" value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>

              <div className="input-wrap">
                <span className="input-icon">*</span>
                <input className="cv-input" type="password" placeholder="MASTER_KEY"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })} />
              </div>

              {isRegister && (
                <>
                  <div className="input-wrap">
                    <span className="input-icon">⇒</span>
                    <input className="cv-input" type="email" placeholder="HEIR_EMAIL"
                      autoComplete="off" value={formData.heir_email}
                      onChange={e => setFormData({ ...formData, heir_email: e.target.value })} />
                  </div>

                  {/* SWITCH DAYS SELECTOR */}
                  <div className="switch-days-wrap">
                    <span className="switch-label">DEAD_MAN_SWITCH:</span>
                    <div className="days-btns">
                      {[1, 10, 30].map(d => (
                        <button key={d}
                          className={`day-btn ${formData.switch_days === d ? 'active' : ''}`}
                          onClick={() => setFormData({ ...formData, switch_days: d })}>
                          {d}D
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="error-msg" style={{ color: authErr.includes('SUCCESS') ? '#00ff41' : '#ff4040' }}>
                {authErr}
              </div>

              <button className="pro-btn" onClick={handleAuth} disabled={loading}>
                {loading ? '...' : (isRegister ? '[ CREATE_IDENTITY ]' : '[ EXECUTE ]')}
              </button>

              <div className="toggle">
                {!isRegister
                  ? <>{'> NEW_NODE? '}<span onClick={() => switchMode('REGISTER')}>REGISTER</span></>
                  : <>{'> HAVE_ACCESS? '}<span onClick={() => switchMode('LOGIN')}>LOGIN</span></>
                }
              </div>
            </div>
          </div>

        ) : (
          <div className="dashboard">
            <div className="side-ctrl">
              <div className="dash-title">ENCRYPT_DATA</div>
              <div className="dp-cube-wrap"><WireframeCube size={90} speed={0.016} /></div>

              <div className="input-wrap">
                <span className="input-icon">$</span>
                <input className="cv-input" type="text" placeholder="SITE_NAME"
                  autoComplete="off" value={entry.site}
                  onChange={e => setEntry({ ...entry, site: e.target.value.toUpperCase() })} />
              </div>
              <div className="input-wrap">
                <span className="input-icon">*</span>
                <input className="cv-input" type="password" placeholder="SECRET_DATA"
                  value={entry.secret}
                  onChange={e => setEntry({ ...entry, secret: e.target.value })} />
              </div>
              <div className="error-msg">{vaultErr}</div>

              <button className="pro-btn" onClick={handleEncrypt} style={{ marginTop: '10px' }}>
                [ ENCRYPT + STORE ]
              </button>

              {/* SWITCH DAYS UPDATE */}
              <div className="switch-days-wrap" style={{ marginTop: '20px' }}>
                <span className="switch-label">DEAD_SWITCH:</span>
                <div className="days-btns">
                  {[1, 10, 30].map(d => (
                    <button key={d}
                      className={`day-btn ${user.dead_man_switch_days === d ? 'active' : ''}`}
                      onClick={() => handleUpdateSwitchDays(d)}>
                      {d}D
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '0.6rem', color: 'rgba(0,255,65,0.4)', marginTop: '8px' }}>
                HEIR: {user.heir_email || 'NOT_SET'}
              </div>
            </div>

            <div className="data-log">
              <div className="dash-title">VAULT_CONTENTS</div>
              <div className="meta-row">
                <div className="meta-item">ENTRIES: <span>{vault.length}</span></div>
                <div className="meta-item">USER: <span>{(user.username || user.email.split('@')[0]).toUpperCase()}</span></div>
              </div>
              <div className="log-list">
                {vault.length === 0
                  ? <div className="empty-msg">:: VAULT_EMPTY ::</div>
                  : vault.map((v) => (
                    <div key={v.id} className="log-row">
                      <span className="entry-site">{(v.site_name || '?').slice(0, 14)}</span>
                      <span className="entry-secret">
                        {showSecret[v.id]
                          ? getDecryptedSecret(v.secret_content)
                          : '••••••••'}
                      </span>
                      <button className="eye-btn" onClick={() => toggleSecret(v.id)}>
                        {showSecret[v.id] ? '🔒' : '👁'}
                      </button>
                      <button className="del-btn" onClick={() => handleDelete(v.id)}>✕</button>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="cv-footer">
        <Clock />
      </footer>
    </div>
  );
}

export default App;
