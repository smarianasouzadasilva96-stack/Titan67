import { Save, Settings } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { updateUserDeliveryMode } from '../lib/workspaceService.ts';

export function SettingsModule() {
  const { user, userProfile, capabilities, notify } = useTitan();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [deliveryMode, setDeliveryMode] = useState<'auto' | 'single-file' | 'multi-file'>(
    userProfile?.defaultDeliveryMode || 'auto',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName);
      setDeliveryMode(userProfile.defaultDeliveryMode);
    }
  }, [userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateUserDeliveryMode(user.uid, displayName.trim(), deliveryMode);
      notify('success', 'Configurações salvas', 'Preferências persistidas no seu perfil Firestore.');
    } catch (err) {
      notify('error', 'Erro ao salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-red-500" />
            Configurações da Workstation
          </h2>
          <p className="text-xs text-zinc-400">
            Preferências de perfil, Single-File Intelligence padrão e informações de sessão.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">Nome de Exibição</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400">
              Modo Padrão do Script Studio (Single-File Intelligence)
            </label>
            <select
              value={deliveryMode}
              onChange={(e) => setDeliveryMode(e.target.value as 'auto' | 'single-file' | 'multi-file')}
              className="w-full px-3.5 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
            >
              <option value="auto">Automático (Detecta frases de arquivo único)</option>
              <option value="single-file">Priorizar Arquivo Único</option>
              <option value="multi-file">Priorizar Múltiplos Arquivos</option>
            </select>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Preferências'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-3 text-xs">
        <h3 className="font-display text-base font-semibold text-white">
          Integrações & Segurança do Servidor
        </h3>
        <div className="space-y-2 text-zinc-400">
          <p>Conta conectada: <span className="text-zinc-200">{user?.email}</span></p>
          <p>
            Motor de IA: <span className="text-zinc-200">{capabilities?.modelName || 'TITAN-Neural-Core-v1'}</span> (100% autônomo no servidor TITAN, sem chaves de IAs externas).
          </p>
          <p>
            Banco de Dados Persistente: <span className="text-zinc-200">Firebase Firestore + SQLite WASM local no Database Studio</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
