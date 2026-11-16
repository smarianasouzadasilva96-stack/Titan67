import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { BookmarkPlus, Brain, Cpu, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { OperationType, db, handleFirestoreError } from '../lib/firebase.ts';
import { streamAiChat } from '../lib/titanApi.ts';
import {
  appendAiMessage,
  createAiSession,
  deleteProjectMemory,
  saveProjectMemory,
} from '../lib/workspaceService.ts';
import type { AiMessageDoc, AiSessionDoc } from '../shared/titanTypes.ts';

export function TitanAiModule() {
  const {
    user,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectFiles,
    selectedProjectMemories,
    notify,
  } = useTitan();
  const [sessions, setSessions] = useState<AiSessionDoc[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageDoc[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');

  const [memTitle, setMemTitle] = useState('');
  const [memRequirements, setMemRequirements] = useState('');
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'aiSessions'),
      where('ownerId', '==', user.uid),
      where('module', '==', 'core-ai'),
      orderBy('updatedAt', 'desc'),
      limit(20),
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AiSessionDoc);
        setSessions(list);
        setActiveSessionId((curr) => (curr && list.some((s) => s.id === curr) ? curr : list[0]?.id || null));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiSessions'),
    );
  }, [user]);

  useEffect(() => {
    if (!user || !activeSessionId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'aiSessions', activeSessionId, 'messages'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'asc'),
      limit(80),
    );
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => d.data() as AiMessageDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, `aiSessions/${activeSessionId}/messages`),
    );
  }, [user, activeSessionId]);

  const handleNewSession = async () => {
    if (!user) return;
    const id = await createAiSession({
      ownerId: user.uid,
      module: 'core-ai',
      title: `Sessão ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    });
    setActiveSessionId(id);
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProjectId || !memTitle.trim() || !memRequirements.trim()) return;
    await saveProjectMemory({
      projectId: selectedProjectId,
      ownerId: user.uid,
      decisionTitle: memTitle.trim(),
      requirements: memRequirements.trim(),
    });
    setMemTitle('');
    setMemRequirements('');
    notify('success', 'Memória persistida', 'Decisão salva no contexto permanente do projeto.');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim() || sending) return;

    const userText = input.trim();
    setInput('');
    setSending(true);

    try {
      let sid = activeSessionId;
      if (!sid) {
        sid = await createAiSession({
          ownerId: user.uid,
          module: 'core-ai',
          title: userText.slice(0, 48),
        });
        setActiveSessionId(sid);
      }

      await appendAiMessage({
        sessionId: sid,
        ownerId: user.uid,
        role: 'user',
        content: userText,
      });

      const activeProj = projects.find((p) => p.id === selectedProjectId);
      const memoryText =
        selectedProjectMemories.length > 0
          ? `\nMEMÓRIAS E DECISÕES PERSISTENTES DO PROJETO:\n${selectedProjectMemories
              .map((m) => `- ${m.decisionTitle}: ${m.requirements}`)
              .join('\n')}`
          : '';
      const workspaceContext = activeProj
        ? `Projeto ativo: ${activeProj.name} (${activeProj.language} / ${activeProj.environment}). Arquivos: ${selectedProjectFiles.map((f) => f.path).join(', ')}${memoryText}`
        : `Total de projetos no Workspace: ${projects.length}.`;

      setStreamingReply('');
      const res = await streamAiChat(
        {
          mode: 'core-ai',
          message: userText,
          history: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          workspaceContext,
        },
        (delta) => {
          setStreamingReply((prev) => prev + delta);
        },
      );

      setStreamingReply('');
      await appendAiMessage({
        sessionId: sid,
        ownerId: user.uid,
        role: 'assistant',
        content: res.reply,
        modelUsed: res.modelUsed,
      });
    } catch (err) {
      setStreamingReply('');
      notify('error', 'Erro no Titan Core AI', err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-11rem)] min-h-[540px]">
      {/* Sessions Sidebar */}
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-white">Sessões & Memória</h2>
          <button
            type="button"
            onClick={() => void handleNewSession()}
            className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md cursor-pointer"
            title="Nova sessão"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <select
          value={selectedProjectId || ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="bg-[#070709] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              Contexto: {p.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowMemoryPanel((v) => !v)}
          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-red-500" />
            Memória do Projeto
          </span>
          <span className="font-mono text-zinc-400">{selectedProjectMemories.length}</span>
        </button>

        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4">Nenhuma conversa salva ainda.</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate cursor-pointer ${
                  s.id === activeSessionId
                    ? 'bg-red-600/20 text-white border border-red-600/40'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                }`}
              >
                {s.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat & Context Memory Viewport */}
      <div className="lg:col-span-3 bg-[#0C0C10] border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-[#101016] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-red-500" />
            <span className="font-display text-sm font-semibold text-white">
              TITAN CORE AI
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            Memória ativa: {selectedProjectMemories.length} regra(s) · {selectedProjectFiles.length} arq.
          </span>
        </div>

        {showMemoryPanel && selectedProjectId && (
          <div className="p-4 border-b border-zinc-800 bg-[#09090D] space-y-3">
            <form onSubmit={handleSaveMemory} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={memTitle}
                onChange={(e) => setMemTitle(e.target.value)}
                placeholder="Título da decisão (ex: Padrão Auth)"
                className="bg-[#0E0E13] border border-zinc-800 rounded px-3 py-1.5 text-xs text-white"
              />
              <input
                value={memRequirements}
                onChange={(e) => setMemRequirements(e.target.value)}
                placeholder="Requisitos técnicos persistentes..."
                className="bg-[#0E0E13] border border-zinc-800 rounded px-3 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Fixar Memória</span>
              </button>
            </form>
            {selectedProjectMemories.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedProjectMemories.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-[#0E0E13] px-3 py-1.5 rounded border border-zinc-800">
                    <div className="truncate">
                      <strong className="text-zinc-200 mr-2">{m.decisionTitle}:</strong>
                      <span className="text-zinc-400">{m.requirements}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteProjectMemory(selectedProjectId, m.id)}
                      className="text-zinc-500 hover:text-red-400 ml-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-zinc-500">
              <p className="text-sm text-zinc-300 font-medium">
                Assistente central TITAN CORE AI pronto com Context & Memory Engine
              </p>
              <p className="text-xs max-w-md">
                Pergunte sobre arquitetura, fixe decisões técnicas persistentes por projeto, peça análise do Workspace ou gere código completo.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-red-600/20 border border-red-600/40 text-zinc-100'
                      : 'bg-[#121218] border border-zinc-800 text-zinc-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-[#121218] border border-red-600/30 text-zinc-200">
                {streamingReply || 'Conectando ao stream TITAN AI...'}
                <span className="inline-block w-1.5 h-4 ml-1 bg-red-500 align-middle animate-pulse" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 bg-[#0A0A0E] flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Converse com o TITAN CORE AI..."
            className="flex-1 px-4 py-2.5 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
