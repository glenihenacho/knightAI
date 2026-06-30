'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MAX_LENGTH,
  type ChatMessage,
  type ChatServerMessage,
} from '@streaming/shared';
import { getToken } from '@/lib/api';
import { wsUrl } from '@/lib/config';
import { useAuth } from '@/lib/auth';

export function Chat({ channelUserId }: { channelUserId: number }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewers, setViewers] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(wsUrl(`/api/chat/${channelUserId}${qs}`));
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      let msg: ChatServerMessage;
      try {
        msg = JSON.parse(event.data) as ChatServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'history') setMessages(msg.messages);
      else if (msg.type === 'message') setMessages((prev) => [...prev, msg.message].slice(-200));
      else if (msg.type === 'presence') setViewers(msg.viewers);
    };

    return () => ws.close();
  }, [channelUserId]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'send', body }));
    setDraft('');
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <span>Stream Chat</span>
        <span className="muted">
          {connected ? (viewers !== null ? `${viewers} here` : 'connected') : 'connecting…'}
        </span>
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            No messages yet — say hi 👋
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg">
            <span className="author">{m.user.displayName}</span>
            <span className="muted">: </span>
            {m.body}
          </div>
        ))}
      </div>
      {user ? (
        <form className="chat-input" onSubmit={sendMessage}>
          <input
            value={draft}
            maxLength={CHAT_MAX_LENGTH}
            placeholder="Send a message"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Chat
          </button>
        </form>
      ) : (
        <div className="chat-input">
          <span className="muted" style={{ fontSize: 13, padding: '8px 2px' }}>
            Log in to join the chat.
          </span>
        </div>
      )}
    </div>
  );
}
