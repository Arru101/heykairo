import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Image as ImageIcon, Smile, ArrowLeft, Lock,
  Loader2, KeyRound, User, ShieldCheck, Copy, Check, X, ZoomIn, Info
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

import { socket } from './utils/socket';
import { deriveKey, encryptMessage, decryptMessage, encryptFile, decryptFile } from './utils/crypto';
import { uploadEncryptedToCloudinary, fetchEncryptedBlob } from './utils/cloudinary';
import { initSecurity, createEphemeralBlobUrl, revokeBlobUrl } from './utils/security';

const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/* ─── Cute Minion Kairo Logo ─────────────────────────────────────────── */
function KairoLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="96" rx="30" ry="22" fill="#3b6ff5"/>
      <circle cx="60" cy="52" r="36" fill="#FFD93D"/>
      <circle cx="24" cy="50" r="7" fill="#F5C518"/>
      <circle cx="96" cy="50" r="7" fill="#F5C518"/>
      <rect x="24" y="38" width="72" height="22" rx="11" fill="#555566"/>
      <circle cx="60" cy="49" r="14" fill="white"/>
      <circle cx="60" cy="49" r="10" fill="#4A9EFF"/>
      <circle cx="60" cy="49" r="5" fill="#111122"/>
      <circle cx="64" cy="44" r="2.5" fill="white"/>
      <circle cx="57" cy="52" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="60" cy="49" r="14" fill="none" stroke="#333344" strokeWidth="2"/>
      <circle cx="28" cy="49" r="3" fill="#444455"/>
      <circle cx="92" cy="49" r="3" fill="#444455"/>
      <ellipse cx="30" cy="68" rx="9" ry="6" fill="#FFB347" opacity="0.45"/>
      <ellipse cx="90" cy="68" rx="9" ry="6" fill="#FFB347" opacity="0.45"/>
      <path d="M42 72 Q60 86 78 72" stroke="#5C3A1E" strokeWidth="3" fill="#FF8C69" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="51" y="73" width="8" height="7" rx="2" fill="white"/>
      <rect x="61" y="73" width="8" height="7" rx="2" fill="white"/>
      <line x1="60" y1="73" x2="60" y2="80" stroke="#ddd" strokeWidth="1"/>
      <rect x="44" y="84" width="32" height="26" rx="4" fill="#2d5de0"/>
      <text x="60" y="103" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" fontFamily="monospace">K</text>
      <rect x="48" y="76" width="8" height="14" rx="4" fill="#2d5de0"/>
      <rect x="64" y="76" width="8" height="14" rx="4" fill="#2d5de0"/>
      <circle cx="52" cy="80" r="2" fill="#60a5fa"/>
      <circle cx="68" cy="80" r="2" fill="#60a5fa"/>
    </svg>
  );
}

/* ─── Toast Component ────────────────────────────────────────────────── */
function Toast({ message, type, visible }) {
  return (
    <div className={`toast ${type}${visible ? ' show' : ''}`}>
      {type === 'success' ? <Check size={14} /> : type === 'error' ? <Info size={14} /> : <Check size={14} />}
      {message}
    </div>
  );
}

/* ─── Image Preview Modal ────────────────────────────────────────────── */
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
        className="modal-image"
        draggable={false}
      />
      <button className="modal-close" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

/* ─── Encrypted Image Component ───────────────────────────────────────── */
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
      try {
        const encBase64 = await fetchEncryptedBlob(cloudinaryUrl);
        if (!encBase64 || cancelled) throw new Error('Fetch failed');
        const result = await decryptFile(encBase64, cryptoKey);
        if (!result || cancelled) throw new Error('Decrypt failed');
        const url = createEphemeralBlobUrl(result.bytes, result.mimeType);
        objRef.current = url;
        if (!cancelled) { setBlobUrl(url); setLoading(false); }
      } catch (e) {
        console.error('Image load error:', e);
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (objRef.current) revokeBlobUrl(objRef.current);
    };
  }, [cloudinaryUrl, cryptoKey]);

  if (loading) return (
    <div className="image-loader">
      <Loader2 size={16} className="spin" />
      <span>Decrypting Image...</span>
    </div>
  );
  if (failed) return <div className="image-failed">Image could not be decrypted</div>;

  return (
    <>
      <div className="message-image-container" onClick={() => setPreview(true)}>
        <img
          src={blobUrl}
          alt="secure"
          className="message-image"
          draggable={false}
          onContextMenu={e => e.preventDefault()}
        />
        <div className="image-zoom-overlay"><ZoomIn size={16} /></div>
      </div>
      {preview && <ImageModal src={blobUrl} onClose={() => setPreview(false)} />}
    </>
  );
}

/* ─── Main Application ────────────────────────────────────────────────── */
function App() {
  const [myId, setMyId] = useState('');
  const [targetIdInput, setTargetIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const [activeChat, setActiveChat] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);
  const cryptoKeyRef = useRef(null);
  const activeChatRef = useRef(null);

  useEffect(() => { cryptoKeyRef.current = cryptoKey; }, [cryptoKey]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => { initSecurity(); }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  /* Mobile Layout Fix for Keyboard */
  useEffect(() => {
    const handleViewportChange = () => {
      if (window.visualViewport) {
        const height = window.visualViewport.height;
        document.documentElement.style.setProperty('--vh', `${height}px`);
        if (messagesAreaRef.current) {
          messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
        }
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
      handleViewportChange();
    }
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, [activeChat]);

  /* Socket Handlers */
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

  /* Presence */
  useEffect(() => {
    if (!activeChat) return;
    const poll = () => socket.emit('check_status', activeChat, res => setIsOnline(res?.isOnline ?? false));
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [activeChat]);

  /* Auto-scroll */
  useEffect(() => {
    if (messagesAreaRef.current) {
      messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!targetIdInput.trim() || !passwordInput.trim()) return;
    try {
      const key = await deriveKey(passwordInput);
      setCryptoKey(key); cryptoKeyRef.current = key;
      const target = targetIdInput.toUpperCase().trim();
      setActiveChat(target); activeChatRef.current = target;
      setMessages([]);
      showToast('Secure channel established!', 'success');
    } catch {
      showToast('Encryption key mismatch or error.', 'error');
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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB)', 'error'); return; }

    const key = cryptoKeyRef.current;
    if (!key) return;
    setUploading(true);
    try {
      const encryptedBase64 = await encryptFile(file, key);
      const url = await uploadEncryptedToCloudinary(encryptedBase64);
      if (url) {
        await sendMessage('', url);
        showToast('Image sent securely!', 'success');
      }
    } catch (err) {
      console.error('Upload Error:', err);
      showToast('Image upload failed. Try again.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      showToast('Your ID copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const parseMessage = (msg) => {
    if (msg._parsed) return msg._parsed;
    try { return JSON.parse(msg.text); } catch { return { text: msg.text, mediaUrl: null }; }
  };

  /* ─── RENDER ────────────────────────────────────────────────────────── */
  if (!activeChat) {
    return (
      <div className="connect-screen">
        <Toast {...toast} />
        <div className="connect-card">
          <div className="connect-header">
            <KairoLogo size={60} />
            <div className="connect-titles">
              <h1>Kairo</h1>
              <p>Secure, Cute & Anonymous</p>
            </div>
          </div>

          <div className="id-section">
            <label>YOUR IDENTITY</label>
            <div className="id-box">
              <span className="mono-id">{myId}</span>
              <button onClick={copyId} className={`copy-btn ${copied ? 'active' : ''}`}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <form onSubmit={handleConnect} className="connect-form">
            <div className="input-group">
              <User size={18} className="input-icon" />
              <input type="text" required placeholder="PARTNER ID" value={targetIdInput} onChange={e => setTargetIdInput(e.target.value)} spellCheck={false} />
            </div>
            <div className="input-group">
              <KeyRound size={18} className="input-icon" />
              <input type="password" required placeholder="ENCRYPTION KEY" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} />
            </div>
            <button type="submit" className="primary-button">Establish Connection</button>
          </form>

          <div className="security-info">
            <Lock size={12} />
            <span>AES-256 E2EE · NO DATA STORED</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Toast {...toast} />
      <div className="chat-container">
        <header className="app-header">
          <div className="header-left">
            <button className="back-button" onClick={endChat}><ArrowLeft size={20} /></button>
            <div className="user-info">
              <span className="user-name mono-id">{activeChat}</span>
              <div className="status-indicator">
                <span className={`dot ${isOnline ? 'online' : 'offline'}`} />
                <span className="status-text">{isOnline ? 'Active Now' : 'Disconnected'}</span>
                {isTyping && <span className="typing-text">typing...</span>}
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="secure-badge"><Lock size={12} /><span>SECURE</span></div>
            <KairoLogo size={32} />
          </div>
        </header>

        <div ref={messagesAreaRef} className="messages-area">
          {messages.length === 0 && (
            <div className="welcome-chat">
              <ShieldCheck size={48} className="welcome-icon" />
              <h3>Secure Channel Open</h3>
              <p>Everything you say here is encrypted and self-destructs when you leave.</p>
            </div>
          )}

          {messages.map((msg, i) => {
            const content = parseMessage(msg);
            return (
              <div key={msg.id || i} className={`message-row ${msg.me ? 'me' : 'other'}`}>
                <div className="message-bubble">
                  {content.mediaUrl && <EncryptedImage cloudinaryUrl={content.mediaUrl} cryptoKey={cryptoKey} />}
                  {content.text && <p className="text-content">{content.text}</p>}
                  <span className="timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ height: '1px' }} />
        </div>

        {showEmoji && (
          <div className="emoji-container">
            <EmojiPicker theme="dark" onEmojiClick={onEmojiClick} height={350} width="100%" />
          </div>
        )}

        <footer className="chat-footer">
          <div className="input-row">
            <button className={`footer-icon ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji(!showEmoji)}><Smile size={22} /></button>
            <label className="footer-icon">
              {uploading ? <Loader2 size={22} className="spin" /> : <ImageIcon size={22} />}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
            </label>
            <div className="input-box">
              <textarea
                ref={textareaRef}
                placeholder="Type a message..."
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
              <button className="send-button" onClick={() => sendMessage(inputText)} disabled={!inputText.trim()}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
