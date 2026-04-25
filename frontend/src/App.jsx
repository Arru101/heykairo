import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, Send, Image as ImageIcon, Smile, ArrowLeft, Lock, Loader2, KeyRound, User, ShieldCheck, Copy, Check } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

import { socket } from './utils/socket';
import { deriveKey, encryptMessage, decryptMessage, encryptFile, decryptFile } from './utils/crypto';
import { uploadEncryptedToCloudinary, fetchEncryptedBlob } from './utils/cloudinary';
import { initSecurity, createEphemeralBlobUrl, revokeBlobUrl } from './utils/security';

const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Decrypt and render an image message
function EncryptedImage({ cloudinaryUrl, cryptoKey }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    const load = async () => {
      setLoading(true);
      const encBase64 = await fetchEncryptedBlob(cloudinaryUrl);
      if (!encBase64) { setFailed(true); setLoading(false); return; }
      const result = await decryptFile(encBase64, cryptoKey);
      if (!result) { setFailed(true); setLoading(false); return; }
      objectUrl = createEphemeralBlobUrl(result.bytes, result.mimeType);
      setBlobUrl(objectUrl);
      setLoading(false);
    };
    load();
    return () => { if (objectUrl) revokeBlobUrl(objectUrl); };
  }, [cloudinaryUrl, cryptoKey]);

  if (loading) return (
    <div className="flex items-center gap-2 text-zinc-500 py-2">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-xs">Decrypting image…</span>
    </div>
  );
  if (failed) return <p className="text-xs text-zinc-500 italic">Image could not be decrypted.</p>;

  return (
    <img
      src={blobUrl}
      alt="secure attachment"
      draggable={false}
      onContextMenu={e => e.preventDefault()}
      className="rounded-lg mb-2 max-w-full object-cover border border-white/5 select-none"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    />
  );
}

function App() {
  const [myId, setMyId] = useState('');
  const [targetIdInput, setTargetIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const [activeChat, setActiveChat] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);
  const cryptoKeyRef = useRef(null);
  const activeChatRef = useRef(null);

  // Keep refs in sync for socket handlers
  useEffect(() => { cryptoKeyRef.current = cryptoKey; }, [cryptoKey]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // Initialize security shield once on mount
  useEffect(() => {
    initSecurity();
  }, []);

  // Socket setup
  useEffect(() => {
    let savedId = localStorage.getItem('kairo_id');
    if (!savedId) {
      savedId = generateId();
      localStorage.setItem('kairo_id', savedId);
    }
    setMyId(savedId);

    socket.connect();

    socket.on('connect', () => {
      socket.emit('identify', savedId);
    });

    socket.on('receive_message', async (data) => {
      const key = cryptoKeyRef.current;
      const chat = activeChatRef.current;
      if (key && data.sender_id === chat) {
        const dec = await decryptMessage(data.encrypted_payload, key);
        setMessages(prev => [...prev, {
          ...data,
          text: dec,
          me: false,
          timestamp: data.timestamp || new Date().toISOString()
        }]);
      }
    });

    socket.on('typing', ({ senderId }) => {
      if (senderId === activeChatRef.current) setIsTyping(true);
    });

    socket.on('stop_typing', ({ senderId }) => {
      if (senderId === activeChatRef.current) setIsTyping(false);
    });

    // Other party ended the chat — auto-clear this side too
    socket.on('chat_ended', () => {
      setMessages([]);
      setActiveChat(null);
      setCryptoKey(null);
      activeChatRef.current = null;
      cryptoKeyRef.current = null;
    });

    return () => {
      socket.off('connect');
      socket.off('receive_message');
      socket.off('typing');
      socket.off('stop_typing');
      socket.off('chat_ended');
    };
  }, []);

  // Presence polling
  useEffect(() => {
    if (!activeChat) return;
    const poll = () => {
      socket.emit('check_status', activeChat, (res) => {
        setIsOnline(res?.isOnline ?? false);
      });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [activeChat]);

  // Auto-scroll to bottom on every new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!targetIdInput.trim() || !passwordInput.trim()) return;
    try {
      const key = await deriveKey(passwordInput);
      setCryptoKey(key);
      cryptoKeyRef.current = key;
      const target = targetIdInput.toUpperCase().trim();
      setActiveChat(target);
      activeChatRef.current = target;
      setMessages([]);
    } catch {
      alert('Failed to establish secure connection. Check your inputs.');
    }
  };

  // End chat: wipe messages from DB on server, clear local state
  const endChat = useCallback(() => {
    const chat = activeChatRef.current;
    if (chat) {
      socket.emit('end_chat', { senderId: myId, receiverId: chat });
    }
    setMessages([]);
    setActiveChat(null);
    setCryptoKey(null);
    activeChatRef.current = null;
    cryptoKeyRef.current = null;
    setInputText('');
    setShowEmoji(false);
  }, [myId]);

  const sendMessage = useCallback(async (text, encryptedMediaUrl = null) => {
    const key = cryptoKeyRef.current;
    const chat = activeChatRef.current;
    if ((!text.trim() && !encryptedMediaUrl) || !key || !chat) return;

    const payload = JSON.stringify({ text: text.trim(), mediaUrl: encryptedMediaUrl });
    const encrypted = await encryptMessage(payload, key);

    const newMsg = {
      id: Date.now(),
      sender_id: myId,
      receiver_id: chat,
      encrypted_payload: encrypted,
      text: payload,
      me: true,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMsg]);
    socket.emit('send_message', {
      senderId: myId,
      receiverId: chat,
      encryptedPayload: encrypted
    });

    setInputText('');
    setShowEmoji(false);
    socket.emit('stop_typing', { senderId: myId, receiverId: chat });

    // CRITICAL UX FIX: Refocus textarea so keyboard stays open
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }, [myId]);

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    const chat = activeChatRef.current;
    if (!chat) return;
    socket.emit('typing', { senderId: myId, receiverId: chat });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { senderId: myId, receiverId: chat });
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
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
      // Encrypt the file before uploading — Cloudinary only ever sees ciphertext
      const encryptedBase64 = await encryptFile(file, key);
      const url = await uploadEncryptedToCloudinary(encryptedBase64);
      if (url) {
        await sendMessage('', url);
      }
    } catch {
      // silent fail
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const parseMessage = (text) => {
    try {
      if (!text || text === '[Encrypted/Unreadable]') return { text, mediaUrl: null };
      return JSON.parse(text);
    } catch {
      return { text, mediaUrl: null };
    }
  };

  // ─── CONNECTION SCREEN ────────────────────────────────────────────────────
  if (!activeChat) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm" style={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #27272a' }}>
            <div style={{ background: '#09090b', padding: '10px', borderRadius: '10px', border: '1px solid #27272a' }}>
              <ShieldCheck size={20} color="#3b82f6" strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#fafafa', margin: 0, letterSpacing: '-0.02em' }}>Kairo</h1>
              <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }}>Military-Grade Encrypted Network</p>
            </div>
          </div>

          {/* Your ID */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#52525b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Identity</label>
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: '700', color: '#fafafa', letterSpacing: '0.15em' }}>{myId}</span>
              <button
                onClick={copyId}
                title="Copy ID"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#22c55e' : '#52525b', transition: 'color 0.2s', padding: '4px' }}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <div style={{ padding: '0 14px', color: '#52525b' }}>
                <User size={16} />
              </div>
              <input
                type="text"
                required
                placeholder="Partner ID (e.g. X4K9P2)"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: '13px', color: '#fafafa', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                value={targetIdInput}
                onChange={e => setTargetIdInput(e.target.value)}
              />
            </div>

            <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <div style={{ padding: '0 14px', color: '#52525b' }}>
                <KeyRound size={16} />
              </div>
              <input
                type="password"
                required
                placeholder="Shared Encryption Key"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '13px 0', fontSize: '13px', color: '#fafafa' }}
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
            </div>

            <p style={{ fontSize: '11px', color: '#3f3f46', textAlign: 'center', margin: '4px 0', lineHeight: '1.6' }}>
              Both parties must enter the <strong style={{ color: '#52525b' }}>identical key</strong> to establish the encrypted tunnel. Your key never leaves this device.
            </p>

            <button
              type="submit"
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.15s', letterSpacing: '0.02em' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
              onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
            >
              Establish Encrypted Connection
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── CHAT SCREEN ─────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#09090b', padding: '0' }}>
      <div style={{
        width: '100%',
        height: '100%',
        maxWidth: '860px',
        display: 'flex',
        flexDirection: 'column',
        background: '#18181b',
        border: '1px solid #27272a',
        overflow: 'hidden'
      }}>

        {/* ── Header ── */}
        <header style={{
          padding: '12px 16px',
          borderBottom: '1px solid #27272a',
          background: '#18181b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={endChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: '6px', borderRadius: '6px', display: 'flex', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fafafa'}
              onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#27272a', border: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={16} color="#71717a" />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fafafa', fontFamily: 'monospace', letterSpacing: '0.1em' }}>{activeChat}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#22c55e' : '#3f3f46', boxShadow: isOnline ? '0 0 6px #22c55e' : 'none', flexShrink: 0 }}></div>
                  <span style={{ fontSize: '11px', color: '#52525b', fontWeight: '500' }}>{isOnline ? 'Online' : 'Offline'}</span>
                  {isTyping && <span style={{ fontSize: '11px', color: '#3b82f6', fontStyle: 'italic' }}>• typing…</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#09090b', border: '1px solid #27272a', borderRadius: '6px', padding: '5px 10px' }}>
            <Lock size={11} color="#3b82f6" />
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#3b82f6', letterSpacing: '0.08em' }}>E2EE</span>
          </div>
        </header>

        {/* ── Messages ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: '#09090b'
          }}
          className="hide-scroll"
        >
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.4 }}>
              <Lock size={32} color="#3f3f46" />
              <p style={{ fontSize: '13px', color: '#52525b', textAlign: 'center', lineHeight: '1.6' }}>
                End-to-end encrypted tunnel established.<br />No messages yet.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const content = parseMessage(msg.text);
            return (
              <div key={msg.id || i} style={{ display: 'flex', justifyContent: msg.me ? 'flex-end' : 'flex-start', width: '100%' }}>
                <div style={{
                  maxWidth: 'min(75%, 480px)',
                  padding: '10px 14px',
                  borderRadius: msg.me ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.me ? '#2563eb' : '#18181b',
                  border: msg.me ? 'none' : '1px solid #27272a',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {content.mediaUrl && (
                    <EncryptedImage cloudinaryUrl={content.mediaUrl} cryptoKey={cryptoKey} />
                  )}
                  {content.text && (
                    <p style={{
                      fontSize: '14px',
                      lineHeight: '1.55',
                      color: msg.me ? '#fff' : '#e4e4e7',
                      margin: 0,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      userSelect: 'text'
                    }}>{content.text}</p>
                  )}
                  <span style={{
                    fontSize: '10px',
                    color: msg.me ? 'rgba(255,255,255,0.45)' : '#52525b',
                    marginTop: '6px',
                    alignSelf: msg.me ? 'flex-end' : 'flex-start',
                    fontWeight: '500'
                  }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>

        {/* ── Emoji Picker ── */}
        {showEmoji && (
          <div style={{ position: 'absolute', bottom: '72px', left: '16px', zIndex: 50, borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <EmojiPicker theme="dark" onEmojiClick={onEmojiClick} height={380} />
          </div>
        )}

        {/* ── Input Bar ── */}
        <div style={{
          padding: '10px 12px',
          background: '#18181b',
          borderTop: '1px solid #27272a',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', maxWidth: '860px', margin: '0 auto' }}>

            {/* Emoji button */}
            <button
              onClick={() => { setShowEmoji(v => !v); textareaRef.current?.focus(); }}
              style={{ padding: '10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', cursor: 'pointer', color: '#52525b', flexShrink: 0, display: 'flex', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fafafa'}
              onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
            >
              <Smile size={20} strokeWidth={2} />
            </button>

            {/* Image upload */}
            <label style={{ padding: '10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', cursor: 'pointer', color: uploading ? '#3b82f6' : '#52525b', flexShrink: 0, display: 'flex', transition: 'color 0.15s' }}>
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={20} strokeWidth={2} />}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>

            {/* Textarea + send */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', background: '#09090b', border: '1px solid #27272a', borderRadius: '10px', overflow: 'hidden' }}>
              <textarea
                ref={textareaRef}
                placeholder="Message…"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                className="hide-scroll"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '11px 14px',
                  fontSize: '14px',
                  color: '#fafafa',
                  resize: 'none',
                  maxHeight: '120px',
                  lineHeight: '1.5',
                  fontFamily: 'Inter, system-ui, sans-serif'
                }}
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() && !uploading}
                style={{
                  padding: '8px 10px',
                  margin: '4px',
                  borderRadius: '7px',
                  background: inputText.trim() ? '#2563eb' : '#27272a',
                  border: 'none',
                  cursor: inputText.trim() ? 'pointer' : 'default',
                  color: inputText.trim() ? '#fff' : '#52525b',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s'
                }}
              >
                <Send size={17} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
