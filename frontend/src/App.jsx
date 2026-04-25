import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Image as ImageIcon, Smile, ArrowLeft, Lock,
  Loader2, KeyRound, User, ShieldCheck, Copy, Check, X, ZoomIn
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

import { socket } from './utils/socket';
import { deriveKey, encryptMessage, decryptMessage, encryptFile, decryptFile } from './utils/crypto';
import { uploadEncryptedToCloudinary, fetchEncryptedBlob } from './utils/cloudinary';
import { initSecurity, createEphemeralBlobUrl, revokeBlobUrl } from './utils/security';

const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/* ─── Kairo SVG Logo ─────────────────────────────────────────────────────── */
function KairoLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="100" fill="#0d0d18" />
      <path d="M256 56 L416 112 L416 264 C416 356 256 456 256 456 C256 456 96 356 96 264 L96 112 Z"
        fill="none" stroke="url(#lg1)" strokeWidth="18" strokeLinejoin="round" />
      <rect x="196" y="172" width="30" height="168" rx="8" fill="url(#lg1)" />
      <path d="M226 260 L312 172 L278 172 L204 240 Z" fill="url(#lg1)" />
      <path d="M226 260 L312 340 L278 340 L204 280 Z" fill="url(#lg1)" />
    </svg>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
function Toast({ message, visible }) {
  return (
    <div className={`toast${visible ? ' show' : ''}`}>
      <Check size={14} color="#22c55e" />
      {message}
    </div>
  );
}

/* ─── Image Preview Modal ────────────────────────────────────────────────── */
function ImageModal({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="img-overlay" onClick={onClose}>
      <img
        src={src}
        alt="preview"
        onClick={e => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
        draggable={false}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 16, right: 16,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '50%', width: 40, height: 40, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

/* ─── Encrypted Image ────────────────────────────────────────────────────── */
function EncryptedImage({ cloudinaryUrl, cryptoKey }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false); setBlobUrl(null);
    (async () => {
      const encBase64 = await fetchEncryptedBlob(cloudinaryUrl);
      if (!encBase64 || cancelled) { if (!cancelled) setFailed(true); setLoading(false); return; }
      const result = await decryptFile(encBase64, cryptoKey);
      if (!result || cancelled) { if (!cancelled) setFailed(true); setLoading(false); return; }
      const url = createEphemeralBlobUrl(result.bytes, result.mimeType);
      objRef.current = url;
      if (!cancelled) { setBlobUrl(url); setLoading(false); }
    })();
    return () => {
      cancelled = true;
      if (objRef.current) revokeBlobUrl(objRef.current);
    };
  }, [cloudinaryUrl, cryptoKey]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: '#8888aa' }}>
      <Loader2 size={14} className="spin" />
      <span style={{ fontSize: 12 }}>Decrypting…</span>
    </div>
  );
  if (failed) return <p style={{ fontSize: 12, color: '#8888aa', fontStyle: 'italic' }}>Image unavailable</p>;

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
        onClick={() => setPreview(true)}>
        <img
          src={blobUrl}
          alt="secure attachment"
          draggable={false}
          onContextMenu={e => e.preventDefault()}
          style={{
            display: 'block',
            borderRadius: 10,
            maxWidth: '100%',
            maxHeight: 260,
            objectFit: 'cover',
            pointerEvents: 'auto',
            userSelect: 'none',
            marginBottom: 4
          }}
        />
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '3px 5px',
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <ZoomIn size={12} color="#fff" />
        </div>
      </div>
      {preview && <ImageModal src={blobUrl} onClose={() => setPreview(false)} />}
    </>
  );
}

/* ─── App ────────────────────────────────────────────────────────────────── */
function App() {
  const [myId, setMyId] = useState('');
  const [targetIdInput, setTargetIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });

  const [activeChat, setActiveChat] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);
  const cryptoKeyRef = useRef(null);
  const activeChatRef = useRef(null);

  useEffect(() => { cryptoKeyRef.current = cryptoKey; }, [cryptoKey]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => { initSecurity(); }, []);

  /* Show toast helper */
  const showToast = useCallback((message) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  /* Socket setup */
  useEffect(() => {
    let savedId = localStorage.getItem('kairo_id');
    if (!savedId) { savedId = generateId(); localStorage.setItem('kairo_id', savedId); }
    setMyId(savedId);
    socket.connect();

    socket.on('connect', () => socket.emit('identify', savedId));

    socket.on('receive_message', async (data) => {
      const key = cryptoKeyRef.current;
      const chat = activeChatRef.current;
      if (!key || data.sender_id !== chat) return;
      const dec = await decryptMessage(data.encrypted_payload, key);
      let parsed;
      try { parsed = JSON.parse(dec); } catch { parsed = { text: dec, mediaUrl: null }; }
      setMessages(prev => [...prev, {
        ...data,
        text: dec,
        _parsed: parsed,
        me: false,
        timestamp: data.timestamp || new Date().toISOString()
      }]);
    });

    socket.on('typing', ({ senderId }) => {
      if (senderId === activeChatRef.current) setIsTyping(true);
    });
    socket.on('stop_typing', ({ senderId }) => {
      if (senderId === activeChatRef.current) setIsTyping(false);
    });
    socket.on('chat_ended', () => {
      setMessages([]); setActiveChat(null); setCryptoKey(null);
      activeChatRef.current = null; cryptoKeyRef.current = null;
    });

    return () => {
      socket.off('connect'); socket.off('receive_message');
      socket.off('typing'); socket.off('stop_typing'); socket.off('chat_ended');
    };
  }, []);

  /* Presence polling */
  useEffect(() => {
    if (!activeChat) return;
    const poll = () => socket.emit('check_status', activeChat, res => setIsOnline(res?.isOnline ?? false));
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [activeChat]);

  /* Auto-scroll to bottom */
  useEffect(() => {
    if (!messagesAreaRef.current) return;
    messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
  }, [messages, isTyping]);

  /* Keep scroll at bottom when keyboard opens on mobile */
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area) return;
    const obs = new ResizeObserver(() => {
      area.scrollTop = area.scrollHeight;
    });
    obs.observe(area);
    return () => obs.disconnect();
  }, [activeChat]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!targetIdInput.trim() || !passwordInput.trim()) return;
    try {
      const key = await deriveKey(passwordInput);
      setCryptoKey(key); cryptoKeyRef.current = key;
      const target = targetIdInput.toUpperCase().trim();
      setActiveChat(target); activeChatRef.current = target;
      setMessages([]);
    } catch {
      alert('Failed to establish secure connection.');
    }
  };

  const endChat = useCallback(() => {
    const chat = activeChatRef.current;
    if (chat) socket.emit('end_chat', { senderId: myId, receiverId: chat });
    setMessages([]); setActiveChat(null); setCryptoKey(null);
    activeChatRef.current = null; cryptoKeyRef.current = null;
    setInputText(''); setShowEmoji(false);
  }, [myId]);

  const sendMessage = useCallback(async (text, encryptedMediaUrl = null) => {
    const key = cryptoKeyRef.current;
    const chat = activeChatRef.current;
    if ((!text.trim() && !encryptedMediaUrl) || !key || !chat) return;

    const payload = JSON.stringify({ text: text.trim(), mediaUrl: encryptedMediaUrl });
    const encrypted = await encryptMessage(payload, key);
    let parsed;
    try { parsed = JSON.parse(payload); } catch { parsed = { text: payload, mediaUrl: null }; }

    const newMsg = {
      id: Date.now(), sender_id: myId, receiver_id: chat,
      encrypted_payload: encrypted,
      text: payload,
      _parsed: parsed,
      me: true,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
    socket.emit('send_message', { senderId: myId, receiverId: chat, encryptedPayload: encrypted });
    setInputText(''); setShowEmoji(false);
    socket.emit('stop_typing', { senderId: myId, receiverId: chat });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [myId]);

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    const chat = activeChatRef.current;
    if (!chat) return;
    socket.emit('typing', { senderId: myId, receiverId: chat });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() =>
      socket.emit('stop_typing', { senderId: myId, receiverId: chat }), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); }
  };

  const onEmojiClick = (emojiObj) => {
    setInputText(prev => prev + emojiObj.emoji);
    textareaRef.current?.focus();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const key = cryptoKeyRef.current;
    if (!key) return;
    setUploading(true);
    try {
      const encryptedBase64 = await encryptFile(file, key);
      const url = await uploadEncryptedToCloudinary(encryptedBase64);
      if (url) {
        await sendMessage('', url);
        showToast('Image sent securely');
      } else {
        showToast('Upload failed — try again');
      }
    } catch {
      showToast('Upload error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      showToast('ID copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const parseMessage = (msg) => {
    if (msg._parsed) return msg._parsed;
    try { return JSON.parse(msg.text); } catch { return { text: msg.text, mediaUrl: null }; }
  };

  /* ─── CONNECTION SCREEN ──────────────────────────────────────────────── */
  if (!activeChat) {
    return (
      <div className="connect-screen">
        <Toast message={toast.message} visible={toast.visible} />
        <div className="connect-card">
          {/* Logo + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--border-subtle)' }}>
            <KairoLogo size={40} />
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>Kairo</h1>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.04em' }}>Military-Grade Encrypted Network</p>
            </div>
          </div>

          {/* Your ID */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Your Identity</label>
            <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.18em' }}>{myId}</span>
              <button onClick={copyId} title="Copy ID" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#22c55e' : 'var(--text-muted)', transition: 'color 0.2s', padding: 4 }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pro-input-wrap">
              <span className="pro-input-icon"><User size={15} /></span>
              <input type="text" required placeholder="Partner ID (e.g. X4K9P2)"
                value={targetIdInput}
                onChange={e => setTargetIdInput(e.target.value)}
                style={{ textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}
              />
            </div>
            <div className="pro-input-wrap">
              <span className="pro-input-icon"><KeyRound size={15} /></span>
              <input type="password" required placeholder="Shared Encryption Key"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.65, margin: '2px 0' }}>
              Both parties must enter the <strong style={{ color: 'var(--text-secondary)' }}>identical key</strong> to open the encrypted tunnel. Your key never leaves this device.
            </p>
            <button type="submit" className="btn-primary">
              Establish Encrypted Connection
            </button>
          </form>

          {/* Security footer */}
          <div className="security-bar" style={{ marginTop: 20 }}>
            <Lock size={10} color="var(--accent)" />
            <span>AES-256-GCM · Zero-Knowledge · No Logs</span>
          </div>
        </div>
      </div>
    );
  }

  /* ─── CHAT SCREEN ────────────────────────────────────────────────────── */
  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Toast message={toast.message} visible={toast.visible} />
      <div className="chat-shell">

        {/* ── Header ── */}
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="icon-btn" onClick={endChat} title="End chat" style={{ minWidth: 36, minHeight: 36, padding: 8 }}>
              <ArrowLeft size={17} />
            </button>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={15} color="var(--text-muted)" />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>{activeChat}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <div className={`online-dot ${isOnline ? 'on' : 'off'}`} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{isOnline ? 'Online' : 'Offline'}</span>
                {isTyping && <span style={{ fontSize: 11, color: 'var(--accent-light)', fontStyle: 'italic' }}>· typing…</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="e2ee-badge">
              <Lock size={10} color="var(--accent)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em' }}>E2EE</span>
            </div>
            <KairoLogo size={26} />
          </div>
        </header>

        {/* ── Messages ── */}
        <div ref={messagesAreaRef} className="messages-area hide-scroll">
          {messages.length === 0 && (
            <div className="empty-state">
              <Lock size={36} color="var(--border)" />
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
                End-to-end encrypted tunnel established.<br />No messages yet.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const content = parseMessage(msg);
            return (
              <div key={msg.id || i} style={{ display: 'flex', justifyContent: msg.me ? 'flex-end' : 'flex-start', width: '100%' }}>
                <div style={{
                  maxWidth: 'min(78%, 480px)',
                  padding: content.mediaUrl ? '8px 8px 6px' : '10px 14px',
                  borderRadius: msg.me ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.me
                    ? 'linear-gradient(135deg, #2d5de0 0%, #3b6ff5 100%)'
                    : 'var(--bg-elevated)',
                  border: msg.me ? 'none' : '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: msg.me ? '0 4px 16px rgba(59,111,245,0.25)' : 'var(--shadow-sm)'
                }}>
                  {content.mediaUrl && (
                    <EncryptedImage cloudinaryUrl={content.mediaUrl} cryptoKey={cryptoKey} />
                  )}
                  {content.text && (
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: msg.me ? '#fff' : 'var(--text-primary)', margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                      {content.text}
                    </p>
                  )}
                  <span style={{ fontSize: 10, color: msg.me ? 'rgba(255,255,255,0.4)' : 'var(--text-muted)', marginTop: 5, alignSelf: msg.me ? 'flex-end' : 'flex-start', fontWeight: 500 }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Typing bubble */}
          {isTyping && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', display: 'inline-flex' }}>
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} style={{ height: 1 }} />
        </div>

        {/* ── Emoji Picker ── */}
        {showEmoji && (
          <div style={{ position: 'absolute', bottom: 70, left: 12, zIndex: 50, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <EmojiPicker theme="dark" onEmojiClick={onEmojiClick} height={360} width={320} />
          </div>
        )}

        {/* ── Input Bar ── */}
        <div className="input-bar">
          <div className="input-row">
            {/* Emoji */}
            <button
              className={`icon-btn${showEmoji ? ' active' : ''}`}
              onClick={() => { setShowEmoji(v => !v); textareaRef.current?.focus(); }}
              title="Emoji"
            >
              <Smile size={19} strokeWidth={2} />
            </button>

            {/* Image upload */}
            <label className={`icon-btn${uploading ? ' uploading' : ''}`} title="Send image" style={{ cursor: 'pointer' }}>
              {uploading
                ? <Loader2 size={19} className="spin" />
                : <ImageIcon size={19} strokeWidth={2} />}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
            </label>

            {/* Textarea + send */}
            <div className="input-field-wrap">
              <textarea
                ref={textareaRef}
                className="chat-textarea hide-scroll"
                placeholder="Message…"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{ overflowY: inputText.split('\n').length > 3 ? 'auto' : 'hidden' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim()}
                style={{
                  background: inputText.trim() ? 'linear-gradient(135deg, #2d5de0, #3b6ff5)' : 'var(--bg-hover)',
                  color: inputText.trim() ? '#fff' : 'var(--text-muted)',
                  boxShadow: inputText.trim() ? '0 2px 10px rgba(59,111,245,0.35)' : 'none'
                }}
              >
                <Send size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
