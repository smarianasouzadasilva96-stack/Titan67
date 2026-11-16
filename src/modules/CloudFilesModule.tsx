import { ArchiveRestore, CloudDownload, FileArchive, HardDrive, ShieldCheck, Trash2, Upload } from 'lucide-react';
import JSZip from 'jszip';
import React, { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import {
  addOrUpdateProjectFile,
  computeSha256Hex,
  createProjectBackup,
  deleteProjectBackup,
  saveProjectToWorkspace,
  writeAuditLog,
} from '../lib/workspaceService.ts';
import type { BackupDoc, FileKind, GeneratedFileItem } from '../shared/titanTypes.ts';

export function CloudFilesModule() {
  const {
    user,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectFiles,
    backups,
    notify,
  } = useTitan();

  const [backupLabel, setBackupLabel] = useState('Snapshot de Segurança');
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [retentionLimit, setRetentionLimit] = useState(10);
  const [busy, setBusy] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;

  const handleCreateBackup = async () => {
    if (!user || !activeProject) {
      notify('warning', 'Selecione um projeto', 'Escolha um projeto no Workspace para gerar backup.');
      return;
    }
    setBusy(true);
    try {
      const res = await createProjectBackup({
        ownerId: user.uid,
        projectId: activeProject.id,
        projectName: activeProject.name,
        label: backupLabel.trim() || `Backup ${new Date().toLocaleString()}`,
        files: selectedProjectFiles.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language,
          fileKind: f.fileKind,
        })),
      });

      // Enforce retention policy for this project if exceeded
      const projBackups = backups.filter((b) => b.projectId === activeProject.id);
      if (projBackups.length >= retentionLimit) {
        const toPrune = projBackups.slice(retentionLimit - 1);
        for (const old of toPrune) {
          await deleteProjectBackup(old.id);
        }
      }

      await writeAuditLog({
        actorId: user.uid,
        module: 'cloud-files',
        action: 'backup_created',
        severity: 'info',
        detail: `Backup ${res.backupId} (SHA-256: ${res.sha256.slice(0, 12)}...) criado para ${activeProject.name}.`,
      });

      notify('success', 'Backup SHA-256 salvo', `Integridade: ${res.sha256.slice(0, 16)}...`);
    } catch (err) {
      notify('error', 'Falha ao criar backup', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportProjectZip = async () => {
    if (!activeProject || selectedProjectFiles.length === 0) return;
    const zip = new JSZip();
    for (const f of selectedProjectFiles) {
      zip.file(f.path.replace(/^\/+/, ''), f.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('success', 'ZIP Exportado', `${selectedProjectFiles.length} arquivos empacotados.`);
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBusy(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const importedFiles: GeneratedFileItem[] = [];
      for (const [relPath, entry] of Object.entries(zip.files)) {
        if (entry.dir || relPath.includes('node_modules/') || relPath.startsWith('.git/')) continue;
        if (importedFiles.length >= 45) break;
        const text = await entry.async('string');
        importedFiles.push({
          path: relPath,
          content: text.slice(0, 190000),
          language: inferLang(relPath),
          fileKind: relPath.endsWith('.md') ? 'Doc' : relPath.endsWith('.json') ? 'Config' : 'Source',
        });
      }
      if (importedFiles.length === 0) {
        notify('warning', 'ZIP vazio', 'Nenhum arquivo legível encontrado no arquivo ZIP.');
        return;
      }
      await saveProjectToWorkspace({
        ownerId: user.uid,
        name: file.name.replace(/\.zip$/i, ''),
        description: `Importado de arquivo ZIP (${importedFiles.length} arquivos)`,
        projectType: 'fullstack',
        language: importedFiles[0].language,
        environment: 'Imported ZIP',
        status: 'COMPLETED',
        files: importedFiles,
      });
      notify('success', 'Projeto importado do ZIP', `${importedFiles.length} arquivos salvos na nuvem.`);
    } catch (err) {
      notify('error', 'Erro ao importar ZIP', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleRestoreBackup = async (bkp: BackupDoc) => {
    if (!user) return;
    if (confirmRestoreId !== bkp.id) {
      setConfirmRestoreId(bkp.id);
      notify('warning', 'Confirme a restauração', `Clique novamente em Restaurar para confirmar integridade SHA-256 de ${bkp.label}.`);
      return;
    }
    setConfirmRestoreId(null);
    setBusy(true);
    try {
      const verifiedSha = await computeSha256Hex(bkp.payloadJson);
      if (verifiedSha !== bkp.sha256) {
        notify('error', 'Falha de Integridade SHA-256', 'O hash do backup não confere. Restauração abortada.');
        return;
      }
      const parsedFiles = JSON.parse(bkp.payloadJson) as Array<{
        path: string;
        content: string;
        language: string;
        fileKind: FileKind;
      }>;

      const targetProj = projects.find((p) => p.id === bkp.projectId);
      if (targetProj) {
        let count = targetProj.filesCount;
        for (const pf of parsedFiles) {
          const existing =
            targetProj.id === selectedProjectId
              ? selectedProjectFiles.find((f) => f.path === pf.path)
              : undefined;
          await addOrUpdateProjectFile({
            projectId: targetProj.id,
            ownerId: user.uid,
            fileId: existing?.id,
            path: pf.path,
            content: pf.content,
            language: pf.language,
            fileKind: pf.fileKind,
            currentVersion: existing?.version,
            currentFilesCount: existing ? undefined : count,
          });
          if (!existing) count += 1;
        }
      } else {
        await saveProjectToWorkspace({
          ownerId: user.uid,
          name: `${bkp.projectName} (Restaurado)`,
          description: `Restaurado do backup ${bkp.id} (SHA-256 verificado)`,
          projectType: 'fullstack',
          language: parsedFiles[0]?.language || 'TypeScript',
          environment: 'Restored',
          status: 'COMPLETED',
          files: parsedFiles,
        });
      }

      await writeAuditLog({
        actorId: user.uid,
        module: 'cloud-files',
        action: 'backup_restored',
        severity: 'info',
        detail: `Backup ${bkp.id} restaurado com verificação SHA-256 aprovada.`,
      });
      notify('success', 'Backup restaurado', `${parsedFiles.length} arquivos restaurados com SHA-256 validado.`);
    } catch (err) {
      notify('error', 'Erro na restauração', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            TITAN Cloud Files & Backups
          </h1>
          <p className="text-sm text-zinc-400">
            Armazenamento em nuvem por projeto, importação/exportação ZIP, política de retenção e restauração com verificação SHA-256.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-red-500" />
            <span>Importar ZIP</span>
            <input type="file" accept=".zip" onChange={(e) => void handleImportZip(e)} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => void handleExportProjectZip()}
            disabled={!activeProject || selectedProjectFiles.length === 0}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <CloudDownload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar ZIP</span>
          </button>
        </div>
      </div>

      {/* Create Backup Box */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <HardDrive className="w-4 h-4 text-red-500" />
          <span>Criar Ponto de Restauração Verificado (SHA-256)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
            className="bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.filesCount} arq.)
              </option>
            ))}
          </select>
          <input
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder="Rótulo do backup"
            className="sm:col-span-2 bg-[#09090D] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={2}
              max={30}
              value={retentionLimit}
              onChange={(e) => setRetentionLimit(Number(e.target.value) || 10)}
              title="Política de retenção por projeto"
              className="w-16 bg-[#09090D] border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-white"
            />
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={busy || !activeProject}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileArchive className="w-3.5 h-3.5" />
              <span>Gerar Backup</span>
            </button>
          </div>
        </div>
      </div>

      {/* Backups List */}
      <div className="bg-[#0E0E13] border border-zinc-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Pontos de Backup Persistentes ({backups.length})
        </h2>

        {backups.length === 0 ? (
          <p className="text-xs text-zinc-500 py-6 text-center">
            Nenhum backup criado ainda.
          </p>
        ) : (
          <div className="space-y-2.5">
            {backups.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-lg bg-[#09090D] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-white">{b.label}</span>
                    <span className="text-[11px] text-zinc-400">({b.projectName} · {b.filesCount} arquivos)</span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-500 truncate">
                    SHA-256: {b.sha256}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleRestoreBackup(b)}
                    disabled={busy}
                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                      confirmRestoreId === b.id
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200'
                    }`}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>{confirmRestoreId === b.id ? 'Confirmar Restauração' : 'Restaurar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void deleteProjectBackup(b.id).then(() => notify('info', 'Backup removido', b.label))
                    }
                    className="p-1.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                    title="Excluir backup"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function inferLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    py: 'Python',
    luau: 'Luau',
    lua: 'Lua',
    kt: 'Kotlin',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    md: 'Markdown',
    sql: 'SQL',
  };
  return map[ext] || 'TypeScript';
}
