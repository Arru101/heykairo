import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Image as ImageIcon, Smile, ArrowLeft, Lock,
  Loader2, KeyRound, User, ShieldCheck, Copy, Check, X, ZoomIn, Info, LogOut
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { motion, AnimatePresence } from 'framer-motion';

import { socket } from './utils/socket';
import { deriveKey, encryptMessage, decryptMessage, encryptFile, decryptFile } from './utils/crypto';
import { uploadEncryptedToCloudinary, fetchEncryptedBlob } from './utils/cloudinary';
import { initSecurity, createEphemeralBlobUrl, revokeBlobUrl } from './utils/security';

const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

function KairoLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="96" rx="30" ry="22" fill="#4f46e5"/>
      <circle cx="60" cy="52" r="36" fill="#FFD93D"/>
      <circle cx="24" cy="50" r="7" fill="#F5C518"/>
      <circle cx="96" cy="50" r="7" fill="#F5C518"/>
      <rect x="24" y="38" width="72" height="22" rx="11" fill="#555566"/>
      <circle cx="60" cy="49" r="14" fill="white"/>
      <circle cx="60" cy="49" r="10" fill="#6366f1"/>
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
      <rect x="44" y="84" width="32" height="26" rx="4" fill="#4f46e5"/>
      <text x="60" y="103" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" fontFamily="monospace">K</text>
      <rect x="48" y="76" width="8" height="14" rx="4" fill="#4f46e5"/>
      <rect x="64" y="76" width="8" height="14" rx="4" fill="#4f46e5"/>
      <circle cx="52" cy="80" r="2" fill="#818cf8"/>
      <circle cx="68" cy="80" r="2" fill="#818cf8"/>
    </svg>
  );
}

function Toast({ message, type, visible }) {
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full flex items-center gap-2 z-[1000] font-semibold shadow-xl transition-transform duration-300 text-white ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} ${visible ? 'translate-y-0' : '-translate-y-24'}`}>
      {type === 'success' ? <Check size={14} /> : <Info size={14} />}
      {message}
    </div>
  );
}

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-[1000]" onClick={onCancel}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-5"><LogOut size={24} /></div>
        <h3 className="text-xl font-bold mb-3 text-zinc-100">End Secure Chat?</h3>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">This will permanently delete all messages on both devices. This action cannot be undone.</p>
        <div className="flex flex-col gap-3">
          <button className="py-3.5 rounded-2xl font-bold w-full bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition-colors" onClick={onCancel}>Stay in Chat</button>
          <button className="py-3.5 rounded-2xl font-bold w-full bg-red-500 text-white hover:bg-red-600 transition-colors" onClick={onConfirm}>Yes, End Chat</button>
        </div>
      </motion.div>
    </div>
  );
}

function ImageModal({ src, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/95 z-[1000] flex items-center justify-center p-4" onClick={onClose}>
      <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={src} alt="preview" onClick={e => e.stopPropagation()} className="max-w-full max-h-full rounded-2xl" />
      <button className="absolute top-6 right-6 bg-white/10 text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" onClick={onClose}><X size={24} /></button>
    </div>
  );
}

function EncryptedImage({ cloudinaryUrl, cryptoKey }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const encBase64 = await fetchEncryptedBlob(cloudinaryUrl);
        if (!encBase64 || cancelled) return;
        const result = await decryptFile(encBase64, cryptoKey);
        if (!result || cancelled) return;
        const url = createEphemeralBlobUrl(result.bytes, result.mimeType);
        objRef.current = url;
        if (!cancelled) { setBlobUrl(url); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; if (objRef.current) revokeBlobUrl(objRef.current); };
  }, [cloudinaryUrl, cryptoKey]);

  if (loading) return <div className="flex items-center gap-2 p-4 text-sm font-medium text-zinc-400"><Loader2 size={16} className="animate-spin" /><span>Decrypting...</span></div>;
  if (failed) return <div className="p-4 text-sm font-medium text-red-500">Image unavailable</div>;

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden mb-2 cursor-pointer border border-white/10 group" onClick={() => setPreview(true)}>
        <img src={blobUrl} alt="secure" className="w-full max-h-[350px] object-cover block transition-transform duration-500 group-hover:scale-105" draggable={false} />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white backdrop-blur-[2px]"><ZoomIn size={24} /></div>
      </div>
      {preview && <ImageModal src={blobUrl} onClose={() => setPreview(false)} />}
    </>
  );
}

function App() {
  const [myId, setMyId] = useState('');
  const [targetIdInput, setTargetIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [cryptoKey, setCryptoKey] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [copied, setCopied] = useState(false);

  const messagesAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const cryptoKeyRef = useRef(null);
  const activeChatRef = useRef(null);

  useEffect(() => { cryptoKeyRef.current = cryptoKey; }, [cryptoKey]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  }, []);

  /* Mobile Scroll to Bottom Fix */
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesAreaRef.current) {
        messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scrollToBottom);
    }
    return () => window.visualViewport?.removeEventListener('resize', scrollToBottom);
  }, [activeChat]);

  /* Extreme Security Measures */
  useEffect(() => {
    const obscureApp = () => document.body.classList.add('security-obscured');
    const revealApp = () => document.body.classList.remove('security-obscured');

    const handleVisibilityChange = () => document.hidden ? obscureApp() : revealApp();
    const handleBlur = () => obscureApp();
    const handleFocus = () => revealApp();

    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' || 
        (e.ctrlKey && e.key.toLowerCase() === 'p') || 
        (e.metaKey && e.key.toLowerCase() === 'p') ||
        (e.metaKey && e.shiftKey && ['s', '3', '4', '5'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        obscureApp();
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('Security Policy: Screenshots are disabled.');
        setTimeout(revealApp, 2000);
      }
    };

    const handleContextMenu = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    if (!document.hasFocus()) obscureApp();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  /* Socket & Lifecycle */
  useEffect(() => {
    let savedId = localStorage.getItem('kairo_id') || generateId();
    localStorage.setItem('kairo_id', savedId);
    setMyId(savedId);
    socket.connect();
    socket.on('connect', () => socket.emit('identify', savedId));
    socket.on('receive_message', async (data) => {
      const key = cryptoKeyRef.current;
      if (!key || data.sender_id !== activeChatRef.current) return;
      const dec = await decryptMessage(data.encrypted_payload, key);
      let parsed; try { parsed = JSON.parse(dec); } catch { parsed = { text: dec, mediaUrl: null }; }
      setMessages(p => [...p, { ...data, text: dec, _parsed: parsed, me: false, timestamp: data.timestamp || new Date().toISOString() }]);
    });
    socket.on('typing', ({ senderId }) => { 
      if (senderId === activeChatRef.current) setIsTyping(true); 
    });
    socket.on('stop_typing', ({ senderId }) => { 
      if (senderId === activeChatRef.current) setIsTyping(false); 
    });
    socket.on('chat_ended', () => { 
      setMessages([]); setActiveChat(null); setCryptoKey(null); setIsTyping(false); 
    });
    return () => socket.disconnect();
  }, []);

  /* Hardware Back Button Intercept */
  useEffect(() => {
    const handlePopState = (e) => {
      if (activeChatRef.current) {
        // Prevent default back navigation
        window.history.pushState(null, '', window.location.href);
        setShowConfirm(true);
      }
    };

    if (activeChat) {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeChat]);

  useEffect(() => {
    if (!activeChat) return;
    socket.emit('check_status', activeChat, res => setIsOnline(res?.isOnline ?? false));
    
    const handleStatus = ({ userId, isOnline }) => {
      if (userId === activeChat) setIsOnline(isOnline);
    };
    socket.on('user_status_changed', handleStatus);
    return () => socket.off('user_status_changed', handleStatus);
  }, [activeChat]);

  useEffect(() => {
    if (messagesAreaRef.current) messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      const key = await deriveKey(passwordInput);
      setCryptoKey(key);
      setActiveChat(targetIdInput.toUpperCase().trim());
      setMessages([]);
      showToast('Connected Securely!', 'success');
    } catch { showToast('Connection failed.', 'error'); }
  };

  const endChat = useCallback(() => {
    const chat = activeChatRef.current;
    if (chat) socket.emit('end_chat', { senderId: myId, receiverId: chat });
    setMessages([]); setActiveChat(null); setCryptoKey(null); setIsTyping(false);
    setInputText(''); setShowEmoji(false); setShowConfirm(false); setPasswordInput('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [myId]);

  const sendMessage = useCallback(async (text, mediaUrl = null) => {
    const key = cryptoKeyRef.current;
    const chat = activeChatRef.current;
    if ((!text.trim() && !mediaUrl) || !key || !chat) return;

    const payload = JSON.stringify({ text: text.trim(), mediaUrl });
    const encrypted = await encryptMessage(payload, key);
    const clientMsgId = Math.random().toString(36).substring(2, 15);
    const newMsg = { id: clientMsgId, sender_id: myId, text: payload, _parsed: { text: text.trim(), mediaUrl }, me: true, timestamp: new Date().toISOString() };
    
    setMessages(p => [...p, newMsg]);
    socket.emit('send_message', { senderId: myId, receiverId: chat, encryptedPayload: encrypted, clientMsgId });
    setInputText('');
    setShowEmoji(false);
    
    // Stop typing instantly
    socket.emit('stop_typing', { senderId: myId, receiverId: chat });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    if (!showEmoji) textareaRef.current?.focus();
  }, [myId, showEmoji]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { showToast('File too large (>8MB)', 'error'); return; }
    
    setUploading(true);
    try {
      const key = cryptoKeyRef.current;
      const encryptedBase64 = await encryptFile(file, key);
      const url = await uploadEncryptedToCloudinary(encryptedBase64);
      await sendMessage('', url);
      showToast('Image sent!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Image failed. Check preset.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
      textareaRef.current?.focus();
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true); showToast('ID Copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!activeChat) {
    return (
      <div className="h-full w-full overflow-y-auto flex items-center justify-center p-4 py-8 lg:p-8 bg-zinc-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-zinc-950 to-zinc-950">
        <Toast {...toast} />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px] bg-zinc-900/60 backdrop-blur-2xl border border-zinc-800/60 rounded-[32px] p-8 lg:p-10 shadow-2xl my-auto">
          <div className="flex flex-col items-center gap-4 mb-10">
            <KairoLogo size={72} />
            <div className="text-center">
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-indigo-600 mb-1">Kairo</h1>
              <p className="text-zinc-400 font-medium text-sm lg:text-base">Secure & Anonymous Chat</p>
            </div>
          </div>
          <div className="mb-8">
            <label className="text-[11px] font-bold text-zinc-500 tracking-[0.15em] mb-2.5 block uppercase">Your Partner ID</label>
            <div className="bg-black/30 border border-zinc-800/60 rounded-2xl p-4 flex justify-between items-center group hover:border-indigo-500/30 transition-colors">
              <span className="font-mono font-bold text-2xl tracking-[0.1em] text-zinc-100">{myId}</span>
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={copyId} className={`p-2 rounded-xl transition-colors ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </motion.button>
            </div>
          </div>
          <form onSubmit={handleConnect} className="flex flex-col gap-4">
            <div className="relative bg-black/30 border border-zinc-800/60 rounded-2xl flex items-center focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all group">
              <User size={18} className="mx-4 text-zinc-500 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                required 
                placeholder="PARTNER ID" 
                value={targetIdInput} 
                onChange={e => setTargetIdInput(e.target.value.toUpperCase())} 
                className="bg-transparent border-none outline-none py-4 pr-4 text-zinc-100 w-full font-semibold placeholder-zinc-600 uppercase"
                spellCheck={false} 
              />
            </div>
            <div className="relative bg-black/30 border border-zinc-800/60 rounded-2xl flex items-center focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all group">
              <KeyRound size={18} className="mx-4 text-zinc-500 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="password" 
                required 
                placeholder="ENCRYPTION KEY" 
                value={passwordInput} 
                onChange={e => setPasswordInput(e.target.value)} 
                className="bg-transparent border-none outline-none py-4 pr-4 text-zinc-100 w-full font-semibold placeholder-zinc-600"
              />
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className="w-full bg-gradient-to-br from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-indigo-600/25 transition-all mt-4">
              Start Chat
            </motion.button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 font-sans transition-all duration-300">
      <Toast {...toast} />
      <AnimatePresence>
        {showConfirm && <ConfirmModal onConfirm={endChat} onCancel={() => setShowConfirm(false)} />}
      </AnimatePresence>
      
      <div className="w-full max-w-[1200px] h-full flex flex-col bg-zinc-900/40 mx-auto lg:border-x border-zinc-800/50 relative overflow-hidden">
        <header className="py-3 px-4 md:px-6 bg-zinc-900/80 backdrop-blur-2xl border-b border-zinc-800/50 flex items-center justify-between z-50">
          <div className="flex items-center gap-3 md:gap-4">
            <button className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors" onClick={() => setShowConfirm(true)}><ArrowLeft size={20} /></button>
            <div>
              <span className="text-[15px] font-bold font-mono tracking-widest block mb-0.5">{activeChat}</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'}`} />
                <span className="text-[11px] font-semibold text-zinc-400 tracking-wide">{isOnline ? 'Active' : 'Offline'}</span>
                {isTyping && <span className="text-[11px] text-indigo-400 italic ml-1">typing...</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-indigo-400 text-[10px] font-extrabold tracking-widest uppercase hidden md:flex">
              <ShieldCheck size={12} /><span>SECURE</span>
            </div>
            <KairoLogo size={28} />
          </div>
        </header>

        <div ref={messagesAreaRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6">
          <AnimatePresence>
            {messages.map((msg, i) => {
              const c = msg._parsed || { text: msg.text, mediaUrl: null };
              const msgId = msg.id || i;
              return (
                <motion.div 
                  key={msgId} 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={`flex w-full ${msg.me ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] md:max-w-[70%] p-3.5 md:p-4 rounded-[22px] relative overflow-hidden group ${msg.me ? 'bg-indigo-600 text-white rounded-br-[8px] shadow-lg shadow-indigo-600/20' : 'bg-zinc-800/80 border border-zinc-700/50 rounded-bl-[8px] backdrop-blur-md text-zinc-100'}`} onContextMenu={(e) => e.preventDefault()}>
                    <div className="transition-all duration-200">
                      {c.mediaUrl && <EncryptedImage cloudinaryUrl={c.mediaUrl} cryptoKey={cryptoKey} />}
                      {c.text && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words font-medium tracking-tight">{c.text}</p>}
                    </div>
                    <span className={`text-[10px] mt-2 block text-right font-bold tracking-wide ${msg.me ? 'text-indigo-200' : 'text-zinc-500'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showEmoji && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-zinc-800/50 bg-zinc-900 overflow-hidden"
            >
              <EmojiPicker theme="dark" lazyLoadEmojis={false} autoFocusSearch={false} searchDisabled={true} previewConfig={{ showPreview: false }} onEmojiClick={(e) => setInputText(p => p + e.emoji)} height={300} width="100%" />
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="p-3 md:p-4 bg-zinc-900/80 backdrop-blur-2xl border-t border-zinc-800/50 z-50 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2 md:gap-3">
            <motion.button 
              whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.9 }}
              className={`p-2.5 rounded-full flex items-center justify-center transition-colors ${showEmoji ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`} 
              onClick={(e) => {
                e.preventDefault();
                if (!showEmoji) {
                  // Aggressive Keyboard Dismissal
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  textareaRef.current?.blur();
                  window.focus(); // Force OS to drop keyboard
                  
                  // Wait 100ms for Android keyboard to physically animate away
                  setTimeout(() => setShowEmoji(true), 100);
                } else {
                  setShowEmoji(false);
                }
              }}
            >
              <Smile size={24} strokeWidth={2.5} />
            </motion.button>
              <label className="p-2.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-full flex items-center justify-center transition-colors cursor-pointer" onMouseDown={e => e.preventDefault()}>
                {uploading ? <Loader2 size={24} className="animate-spin" /> : <ImageIcon size={24} strokeWidth={2.5} />}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
              <div className="flex-1 bg-black/30 border border-zinc-700/50 rounded-[28px] flex items-end focus-within:border-indigo-500/50 focus-within:bg-zinc-800/50 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all shadow-inner">
                <textarea
                  ref={textareaRef}
                  placeholder="Message..."
                  value={inputText}
                  readOnly={showEmoji} // Fallback for older Androids
                  inputMode={showEmoji ? 'none' : 'text'} // VITAL: Completely disables virtual keyboard at OS hardware level
                  onChange={e => { 
                    setInputText(e.target.value); 
                    
                    // Precision Typing Debounce Algorithm
                    socket.emit('typing', { senderId: myId, receiverId: activeChat }); 
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {
                      socket.emit('stop_typing', { senderId: myId, receiverId: activeChat });
                    }, 1500);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); } }}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none py-3.5 px-5 text-zinc-100 text-[15px] font-medium resize-none max-h-[120px] placeholder-zinc-500"
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                />
                <motion.button 
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 md:w-11 md:h-11 m-1.5 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30 disabled:opacity-30 disabled:shadow-none transition-opacity" 
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => sendMessage(inputText)} 
                  disabled={!inputText.trim()}
                >
                  <Send size={18} strokeWidth={2.5} className="-ml-0.5" />
                </motion.button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
