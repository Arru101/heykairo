import React, { useState, useEffect, useRef } from 'react';
import { Share, Send, Image as ImageIcon, Smile, ArrowLeft, Lock, Loader2, KeyRound, User, ShieldCheck } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

import { socket } from './utils/socket';
import { deriveKey, encryptMessage, decryptMessage } from './utils/crypto';
import { uploadToCloudinary } from './utils/cloudinary';

const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

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

  const messagesEndRef = useRef(null);
  let typingTimeout = useRef(null);

  useEffect(() => {
    let savedId = localStorage.getItem('purechat_id');
    if (!savedId) {
      savedId = generateId();
      localStorage.setItem('purechat_id', savedId);
    }
    setMyId(savedId);

    socket.connect();
    socket.on('connect', () => {
      socket.emit('identify', savedId);
    });

    socket.on('receive_message', async (data) => {
      if (cryptoKey && data.sender_id === activeChat) {
        const dec = await decryptMessage(data.encrypted_payload, cryptoKey);
        setMessages(prev => [...prev, { ...data, text: dec, me: false }]);
      }
    });

    socket.on('typing', ({ senderId }) => {
      if (senderId === activeChat) setIsTyping(true);
    });

    socket.on('stop_typing', ({ senderId }) => {
      if (senderId === activeChat) setIsTyping(false);
    });

    return () => {
      socket.off('connect');
      socket.off('receive_message');
      socket.off('typing');
      socket.off('stop_typing');
    };
  }, [activeChat, cryptoKey]);

  useEffect(() => {
    if (!activeChat) return;
    const interval = setInterval(() => {
      socket.emit('check_status', activeChat, (res) => {
        setIsOnline(res.isOnline);
      });
    }, 5000);
    socket.emit('check_status', activeChat, (res) => {
      setIsOnline(res.isOnline);
    });
    return () => clearInterval(interval);
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, [messages]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!targetIdInput || !passwordInput) return;
    try {
      const key = await deriveKey(passwordInput);
      setCryptoKey(key);
      setActiveChat(targetIdInput.toUpperCase());
      setMessages([]);
    } catch (err) {
      alert("Failed to setup secure connection.");
    }
  };

  const sendMessage = async (text, mediaUrl = null) => {
    if ((!text && !mediaUrl) || !cryptoKey || !activeChat) return;
    
    const payload = JSON.stringify({ text, mediaUrl });
    const encrypted = await encryptMessage(payload, cryptoKey);
    
    const newMsg = {
      id: Date.now(),
      sender_id: myId,
      receiver_id: activeChat,
      encrypted_payload: encrypted,
      text: payload,
      me: true,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMsg]);
    socket.emit('send_message', {
      senderId: myId,
      receiverId: activeChat,
      encryptedPayload: encrypted
    });
    
    setInputText('');
    setShowEmoji(false);
    socket.emit('stop_typing', { senderId: myId, receiverId: activeChat });
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    socket.emit('typing', { senderId: myId, receiverId: activeChat });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { senderId: myId, receiverId: activeChat });
    }, 2000);
  };

  const onEmojiClick = (emojiObj) => {
    setInputText(prev => prev + emojiObj.emoji);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToCloudinary(file);
    setUploading(false);
    if (url) {
      sendMessage('', url);
    }
  };

  // Connection Screen (Dashboard)
  if (!activeChat) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm pro-panel rounded-xl p-8 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[#27272a]">
            <div className="bg-zinc-800 p-2 rounded-lg">
              <ShieldCheck className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">PureChat Enterprise</h1>
              <p className="text-xs text-zinc-400">E2E Encrypted Network</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Your Identity ID</label>
            <div className="pro-input flex items-center justify-between rounded-lg px-4 py-3">
              <span className="font-mono text-lg font-medium text-white tracking-widest">{myId}</span>
              <button className="text-zinc-400 hover:text-white transition-colors" title="Share ID">
                <Share size={18} />
              </button>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">New Session</label>
              <div className="pro-input flex items-center rounded-lg overflow-hidden group">
                <div className="pl-4 text-zinc-500">
                  <User size={18} />
                </div>
                <input 
                  type="text"
                  required
                  placeholder="Partner ID"
                  className="w-full bg-transparent px-3 py-3 text-sm focus:outline-none placeholder:text-zinc-600 font-mono tracking-widest uppercase"
                  value={targetIdInput}
                  onChange={e => setTargetIdInput(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="pro-input flex items-center rounded-lg overflow-hidden">
                <div className="pl-4 text-zinc-500">
                  <KeyRound size={18} />
                </div>
                <input 
                  type="password"
                  required
                  placeholder="Encryption Key"
                  className="w-full bg-transparent px-3 py-3 text-sm focus:outline-none placeholder:text-zinc-600"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                A shared key is required to establish the TLS-like connection. This key is localized and never broadcasted.
              </p>
            </div>

            <button 
              type="submit"
              className="pro-btn-primary w-full py-3 rounded-lg text-sm flex items-center justify-center mt-2 cursor-pointer"
            >
              Establish Secure Connection
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Chat Screen
  return (
    <div className="w-full h-full flex flex-col md:py-8 items-center bg-[#09090b]">
      <div className="w-full h-full max-w-4xl pro-panel md:rounded-xl flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <header className="px-5 py-3 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between md:rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveChat(null)} className="p-1.5 text-zinc-400 hover:text-white transition-colors hover:bg-zinc-800 rounded-md">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center border border-[#27272a]">
                <User size={16} className="text-zinc-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white leading-tight font-mono">{activeChat}</span>
                <span className="text-xs text-zinc-500 flex items-center gap-1.5 leading-tight">
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-zinc-600'}`}></div>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-400 bg-zinc-800/50 px-2.5 py-1 rounded-md border border-[#27272a]">
            <Lock size={12} />
            <span className="text-[10px] font-medium tracking-wide">E2EE ACTIVE</span>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#09090b] hide-scroll">
          {messages.map((msg, i) => {
            let content = { text: '', mediaUrl: null };
            try {
              if (msg.text === "[Encrypted/Unreadable]") {
                content.text = msg.text;
              } else {
                content = JSON.parse(msg.text);
              }
            } catch(e) {
              content.text = msg.text;
            }

            return (
              <div key={i} className={`flex w-full ${msg.me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] md:max-w-[60%] p-3 px-4 flex flex-col ${msg.me ? 'pro-bubble-me' : 'pro-bubble-other'}`}>
                  {content.mediaUrl && (
                    <img src={content.mediaUrl} alt="attachment" className="rounded mb-2 max-w-full object-cover border border-[#27272a]" />
                  )}
                  {content.text && <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{content.text}</p>}
                  <span className={`text-[10px] mt-1.5 font-medium ${msg.me ? 'text-blue-200' : 'text-zinc-500'} ${msg.me ? 'self-end' : 'self-start'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          })}
          
          {isTyping && (
             <div className="flex justify-start w-full animate-in fade-in">
               <div className="pro-bubble-other py-3 px-4 flex gap-1 items-center">
                 <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                 <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                 <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-[#18181b] border-t border-[#27272a] md:rounded-b-xl shrink-0 relative">
          {showEmoji && (
            <div className="absolute bottom-full left-3 mb-2 z-50 shadow-xl rounded-lg border border-[#27272a] overflow-hidden">
              <EmojiPicker theme="dark" onEmojiClick={onEmojiClick} />
            </div>
          )}
          
          <div className="flex gap-2 items-end max-w-4xl mx-auto">
            <button 
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-2.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800 border border-transparent hover:border-[#27272a]"
              title="Emoji"
            >
              <Smile size={20} strokeWidth={2} />
            </button>
            <label className="p-2.5 text-zinc-400 hover:text-white transition-colors rounded-lg cursor-pointer hover:bg-zinc-800 border border-transparent hover:border-[#27272a]" title="Upload Image">
              {uploading ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={20} strokeWidth={2} />}
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
            
            <div className="flex-1 pro-input rounded-lg flex items-end overflow-hidden focus-within:border-blue-600 pr-1">
              <textarea 
                placeholder="Message"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputText);
                  }
                }}
                rows={1}
                className="w-full bg-transparent px-3 py-2.5 text-white text-[14px] focus:outline-none placeholder:text-zinc-600 resize-none max-h-32 hide-scroll"
                style={{ minHeight: '40px' }}
              />
              <button 
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim()}
                className="p-1.5 mb-1 mr-1 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors"
                title="Send"
              >
                <Send size={16} strokeWidth={2} className="ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
