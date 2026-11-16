import JSZip from 'jszip';
import {
  Copy,
  Download,
  Eye,
  FileCode2,
  FolderGit2,
  ListTree,
  Play,
  Plus,
  Redo2,
  Replace,
  Save,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { executeInSandbox } from '../lib/titanApi.ts';
import {
  addOrUpdateProjectFile,
  deleteProjectFile,
  deleteProjectRecursive,
  renameProject,
  saveProjectToWorkspace,
} from '../lib/workspaceService.ts';
import type { FileKind, ProjectType } from '../shared/titanTypes.ts';

export function WorkspaceModule() {
  const {
    user,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProjectFiles,
    notify,
  } = useTitan();

  const [search, setSearch] = useState('');
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const [newProjectName, setNewProjectName] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [renamingName, setRenamingName] = useState('');
  const [saving, setSaving] = useState(false);

  // Live Dev panels
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showOutline, setShowOutline] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string; runtime: string; durationMs: number } | null>(null);
  const [runningCode, setRunningCode] = useState(false);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || null;
  const activeFile = selectedProjectFiles.find((f) => f.id === selectedFileId) || selectedProjectFiles[0] || null;

  useEffect(() => {
    if (activeProject) {
      setRenamingName(activeProject.name);
      setOpenTabs([]);
    }
  }, [activeProject]);

  useEffect(() => {
    if (activeFile) {
      setSelectedFileId(activeFile.id);
      setEditorContent(activeFile.content);
      setUndoStack([]);
      setRedoStack([]);
      setOpenTabs((prev) => (prev.includes(activeFile.id) ? prev : [...prev.slice(-6), activeFile.id]));
    } else {
      setSelectedFileId(null);
      setEditorContent('');
    }
  }, [activeFile?.id, activeFile?.version]);

  const updateEditorWithUndo = (nextText: string) => {
    setUndoStack((prev) => [...prev.slice(-25), editorContent]);
    setRedoStack([]);
    setEditorContent(nextText);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, editorContent]);
    setEditorContent(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, editorContent]);
    setEditorContent(next);
  };

  const symbols = useMemo(() => {
    const out: Array<{ line: number; name: string }> = [];
    editorContent.split('\n').forEach((line, idx) => {
      const m = line.match(
        /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|def|fun|local\s+function)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
      );
      if (m) out.push({ line: idx + 1, name: m[1] });
    });
    return out;
  }, [editorContent]);

  const globalMatches = useMemo(() => {
    if (!findQuery.trim()) return [];
    const q = findQuery.toLowerCase();
    return selectedProjectFiles
      .filter((f) => f.content.toLowerCase().includes(q))
      .map((f) => ({
        fileId: f.id,
        path: f.path,
        count: f.content.toLowerCase().split(q).length - 1,
      }));
  }, [findQuery, selectedProjectFiles]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.language.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newProjectName.trim()) return;
    const id = await saveProjectToWorkspace({
      ownerId: user.uid,
      name: newProjectName.trim(),
      description: 'Projeto criado no TITAN Workspace',
      projectType: 'script',
      language: 'Python',
      environment: 'Python 3',
      status: 'IMPLEMENTING',
      files: [
        {
          path: 'main.py',
          content: 'def main():\n    print("TITAN Workspace Ready")\n\nif __name__ == "__main__":\n    main()\n',
          language: 'Python',
          fileKind: 'Source',
        },
      ],
    });
    setSelectedProjectId(id);
    setNewProjectName('');
    notify('success', 'Projeto criado', 'Novo projeto salvo no Firestore.');
  };

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeProject || !newFilePath.trim()) return;
    const id = await addOrUpdateProjectFile({
      projectId: activeProject.id,
      ownerId: user.uid,
      path: newFilePath.trim(),
      content: `// ${newFilePath.trim()}\n`,
      language: activeProject.language,
      fileKind: 'Source' as FileKind,
      currentFilesCount: selectedProjectFiles.length,
    });
    setSelectedFileId(id);
    setNewFilePath('');
    notify('success', 'Arquivo criado', newFilePath.trim());
  };

  const handleSaveFile = async () => {
    if (!user || !activeProject || !activeFile) return;
    setSaving(true);
    try {
      await addOrUpdateProjectFile({
        projectId: activeProject.id,
        ownerId: user.uid,
        fileId: activeFile.id,
        path: activeFile.path,
        content: editorContent,
        language: activeFile.language,
        fileKind: activeFile.fileKind,
        currentVersion: activeFile.version,
      });
      notify('success', 'Arquivo salvo', `${activeFile.path} (v${activeFile.version + 1}) persistido.`);
    } finally {
      setSaving(false);
    }
  };

  const handleGlobalReplace = async () => {
    if (!user || !activeProject || !findQuery) return;
    let updatedCount = 0;
    for (const f of selectedProjectFiles) {
      const currentVal = f.id === activeFile?.id ? editorContent : f.content;
      if (currentVal.includes(findQuery)) {
        const replaced = currentVal.split(findQuery).join(replaceText);
        if (f.id === activeFile?.id) setEditorContent(replaced);
        await addOrUpdateProjectFile({
          projectId: activeProject.id,
          ownerId: user.uid,
          fileId: f.id,
          path: f.path,
          content: replaced,
          language: f.language,
          fileKind: f.fileKind,
          currentVersion: f.version,
        });
        updatedCount += 1;
      }
    }
    notify('success', 'Substituição global concluída', `${updatedCount} arquivo(s) atualizado(s).`);
  };

  const handleRunActiveFile = async () => {
    if (!activeFile) return;
    setRunningCode(true);
    try {
      const res = await executeInSandbox({
        language: activeFile.language,
        code: editorContent,
      });
      setRunOutput({
        stdout: res.stdout || (res.limitationReason || ''),
        stderr: res.stderr,
        runtime: res.runtime,
        durationMs: res.durationMs,
      });
    } catch (err) {
      notify('error', 'Falha na execução', err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCode(false);
    }
  };

  const handleDuplicateProject = async () => {
    if (!user || !activeProject) return;
    const id = await saveProjectToWorkspace({
      ownerId: user.uid,
      name: `${activeProject.name} (Cópia)`,
      description: activeProject.description || '',
      projectType: activeProject.projectType as ProjectType,
      language: activeProject.language,
      environment: activeProject.environment,
      status: activeProject.status,
      files: selectedProjectFiles.map((f) => ({
        path: f.path,
        content: f.content,
        language: f.language,
        fileKind: f.fileKind,
      })),
    });
    setSelectedProjectId(id);
    notify('success', 'Projeto duplicado', 'Cópia completa criada no Workspace.');
  };

  const handleExportZip = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    for (const f of selectedProjectFiles) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}.zip`;
    a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeProject) return;
    const text = await file.text();
    await addOrUpdateProjectFile({
      projectId: activeProject.id,
      ownerId: user.uid,
      path: file.name,
      content: text,
      language: activeProject.language,
      fileKind: 'Source',
      currentFilesCount: selectedProjectFiles.length,
    });
    notify('success', 'Importado', `${file.name} adicionado ao projeto.`);
  };

  const htmlPreviewDoc = useMemo(() => {
    const htmlFile = selectedProjectFiles.find((f) => f.path.toLowerCase().endsWith('.html'));
    if (htmlFile) return htmlFile.id === activeFile?.id ? editorContent : htmlFile.content;
    if (activeFile?.path.toLowerCase().endsWith('.html')) return editorContent;
    return null;
  }, [selectedProjectFiles, activeFile, editorContent]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Projects List */}
      <div className="lg:col-span-3 bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-red-500" />
          <h2 className="font-display text-sm font-semibold text-white">Projetos ({projects.length})</h2>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-200"
          />
        </div>

        <form onSubmit={handleCreateProject} className="flex gap-1.5">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Novo projeto..."
            className="flex-1 px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-200"
          />
          <button
            type="submit"
            className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md cursor-pointer"
            title="Criar projeto"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="space-y-1 max-h-[420px] overflow-y-auto">
          {filteredProjects.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">Nenhum projeto salvo.</p>
          ) : (
            filteredProjects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => setSelectedProjectId(proj.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  proj.id === selectedProjectId
                    ? 'bg-red-600/20 border border-red-600/40 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <p className="font-medium truncate">{proj.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {proj.language} · {proj.filesCount} arquivo(s)
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Live IDE & Multi-Tab Editor */}
      <div className="lg:col-span-9 space-y-4">
        {activeProject ? (
          <>
            <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={renamingName}
                  onChange={(e) => setRenamingName(e.target.value)}
                  onBlur={() => {
                    if (renamingName.trim() && renamingName !== activeProject.name) {
                      void renameProject(activeProject.id, renamingName.trim(), activeProject.description || '');
                    }
                  }}
                  className="bg-transparent border-b border-transparent focus:border-red-600 font-display text-base font-semibold text-white focus:outline-none"
                />
                <span className="text-xs text-zinc-500">
                  {activeProject.language} · {activeProject.environment}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGlobalSearch((v) => !v)}
                  className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Replace className="w-3.5 h-3.5 text-red-500" />
                  <span>Buscar/Substituir</span>
                </button>
                <label className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Importar
                  <input type="file" onChange={(e) => void handleImportFile(e)} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => void handleDuplicateProject()}
                  className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportZip()}
                  className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  ZIP
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProjectRecursive(activeProject.id)}
                  className="px-2.5 py-1.5 bg-zinc-900 hover:bg-red-950 border border-zinc-700 text-xs text-red-400 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              </div>
            </div>

            {showGlobalSearch && (
              <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={findQuery}
                    onChange={(e) => setFindQuery(e.target.value)}
                    placeholder="Buscar no projeto..."
                    className="bg-[#070709] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <input
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="Substituir por..."
                    className="bg-[#070709] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGlobalReplace()}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    Substituir em Todos os Arquivos
                  </button>
                </div>
                {globalMatches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {globalMatches.map((m) => (
                      <button
                        key={m.fileId}
                        type="button"
                        onClick={() => setSelectedFileId(m.fileId)}
                        className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[11px] font-mono text-zinc-300 cursor-pointer"
                      >
                        {m.path} ({m.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* File Tree */}
              <div className="md:col-span-4 bg-[#0C0C10] border border-zinc-800 rounded-xl p-3 space-y-3">
                <form onSubmit={handleAddFile} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="src/novo.ts"
                    className="flex-1 px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded text-xs font-mono text-zinc-200"
                  />
                  <button type="submit" className="p-1.5 bg-zinc-900 border border-zinc-700 text-white rounded cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="space-y-1 max-h-[420px] overflow-y-auto">
                  {selectedProjectFiles.map((f) => (
                    <div
                      key={f.id}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono ${
                        f.id === activeFile?.id
                          ? 'bg-red-600/20 text-white border border-red-600/40'
                          : 'text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFileId(f.id);
                          setEditorContent(f.content);
                        }}
                        className="flex items-center gap-1.5 truncate flex-1 text-left cursor-pointer"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="truncate">{f.path}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteProjectFile(activeProject.id, f.id, selectedProjectFiles.length)}
                        className="text-zinc-600 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Multi-Tab Editor */}
              <div className="md:col-span-8 bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                {/* Multi-Tabs Bar */}
                {openTabs.length > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1.5 bg-[#09090D] border-b border-zinc-800 overflow-x-auto">
                    {openTabs.map((tabId) => {
                      const f = selectedProjectFiles.find((x) => x.id === tabId);
                      if (!f) return null;
                      return (
                        <div
                          key={tabId}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono shrink-0 ${
                            tabId === activeFile?.id
                              ? 'bg-zinc-800 text-white'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedFileId(tabId)}
                            className="cursor-pointer"
                          >
                            {f.path.split('/').pop()}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenTabs((prev) => prev.filter((t) => t !== tabId))}
                            className="hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeFile ? (
                  <>
                    <div className="px-4 py-2.5 border-b border-zinc-800 bg-[#101016] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-mono text-zinc-300">
                        {activeFile.path} · v{activeFile.version}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleUndo}
                          disabled={undoStack.length === 0}
                          title="Desfazer"
                          className="p-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700 rounded text-zinc-300 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleRedo}
                          disabled={redoStack.length === 0}
                          title="Refazer"
                          className="p-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-700 rounded text-zinc-300 cursor-pointer"
                        >
                          <Redo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowOutline((v) => !v)}
                          title="Símbolos"
                          className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-zinc-300 cursor-pointer"
                        >
                          <ListTree className="w-3.5 h-3.5" />
                        </button>
                        {htmlPreviewDoc && (
                          <button
                            type="button"
                            onClick={() => setShowPreview((v) => !v)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-red-500" />
                            <span>Preview</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRunActiveFile()}
                          disabled={runningCode}
                          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{runningCode ? 'Executando...' : 'Executar'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveFile()}
                          disabled={saving}
                          className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>

                    {showOutline && symbols.length > 0 && (
                      <div className="px-4 py-2 bg-[#09090D] border-b border-zinc-800 flex flex-wrap gap-1.5">
                        {symbols.map((s) => (
                          <span key={`${s.line}-${s.name}`} className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[11px] font-mono text-zinc-300">
                            L{s.line}: {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <textarea
                      value={editorContent}
                      onChange={(e) => updateEditorWithUndo(e.target.value)}
                      spellCheck={false}
                      rows={17}
                      className="w-full p-4 bg-[#070709] font-mono text-xs sm:text-sm text-zinc-100 focus:outline-none"
                    />

                    {runOutput && (
                      <div className="p-3 bg-[#09090D] border-t border-zinc-800 text-xs font-mono space-y-1">
                        <div className="text-zinc-400">
                          Sandbox: {runOutput.runtime} ({runOutput.durationMs}ms)
                        </div>
                        {runOutput.stdout && <pre className="text-emerald-400 whitespace-pre-wrap">{runOutput.stdout}</pre>}
                        {runOutput.stderr && <pre className="text-red-400 whitespace-pre-wrap">{runOutput.stderr}</pre>}
                      </div>
                    )}

                    {showPreview && htmlPreviewDoc && (
                      <div className="border-t border-zinc-800 bg-white h-64">
                        <iframe
                          title="Live HTML Preview"
                          sandbox="allow-scripts"
                          srcDoc={htmlPreviewDoc}
                          className="w-full h-full border-0"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-10 text-center text-xs text-zinc-500">
                    Selecione ou crie um arquivo para editar.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-12 text-center space-y-2">
            <p className="text-sm text-zinc-300 font-medium">Workspace vazio</p>
            <p className="text-xs text-zinc-500">
              Crie um projeto à esquerda ou salve qualquer saída do Script Studio / Project Builder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
