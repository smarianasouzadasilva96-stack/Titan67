import { Database, Download, Play, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { useTitan } from '../contexts/TitanContext.tsx';

interface QueryResultSet {
  columns: string[];
  values: unknown[][];
}

const DEFAULT_SQL = `-- Banco SQLite WebAssembly em execução real no navegador
CREATE TABLE IF NOT EXISTS engineers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

INSERT INTO engineers (name, specialty) VALUES
  ('Ana Silva', 'Backend & Compiladores'),
  ('Carlos Souza', 'Android & Kotlin'),
  ('Marina Costa', 'Luau & Sistemas Distribuídos');

SELECT id, name, specialty, active FROM engineers ORDER BY id ASC;`;

export function DatabaseStudioModule() {
  const { notify } = useTitan();
  const dbRef = useRef<SqlJsDatabase | null>(null);
  const [ready, setReady] = useState(false);
  const [sqlInput, setSqlInput] = useState(DEFAULT_SQL);
  const [results, setResults] = useState<QueryResultSet[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Visual table builder state
  const [newTableName, setNewTableName] = useState('deployments');
  const [newColumns, setNewColumns] = useState('id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL');

  useEffect(() => {
    let cancelled = false;
    initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
      .then((SQL) => {
        if (cancelled) return;
        const db = new SQL.Database();
        dbRef.current = db;
        setReady(true);
        executeSql(DEFAULT_SQL, db);
      })
      .catch((err) => {
        setErrorMsg(`Falha ao inicializar motor SQLite WebAssembly: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
      dbRef.current?.close();
    };
  }, []);

  const refreshTables = (db: SqlJsDatabase) => {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
    if (res[0]) {
      setTables(res[0].values.map((row) => String(row[0])));
    } else {
      setTables([]);
    }
  };

  const executeSql = (queryText: string, explicitDb?: SqlJsDatabase) => {
    const db = explicitDb || dbRef.current;
    if (!db) return;
    setErrorMsg(null);
    try {
      const res = db.exec(queryText);
      setResults(res.map((r) => ({ columns: r.columns, values: r.values })));
      refreshTables(db);
      setHistory((prev) => [queryText.trim(), ...prev.slice(0, 14)]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newTableName)) {
      notify('error', 'Nome de tabela inválido', 'Use apenas letras, números e underline.');
      return;
    }
    const ddl = `CREATE TABLE IF NOT EXISTS ${newTableName} (${newColumns});\nSELECT name, sql FROM sqlite_master WHERE type='table' AND name='${newTableName}';`;
    setSqlInput(ddl);
    executeSql(ddl);
    notify('success', 'Tabela criada', `Tabela "${newTableName}" criada no banco SQLite.`);
  };

  const handleExportJson = () => {
    if (results.length === 0) return;
    const payload = results.map((set) =>
      set.values.map((row) =>
        Object.fromEntries(set.columns.map((col, idx) => [col, row[idx]])),
      ),
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'titan-db-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSqliteBinary = () => {
    if (!dbRef.current) return;
    const data = dbRef.current.export();
    const blob = new Blob([new Uint8Array(data)], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'titan-database.sqlite';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-red-500" />
              TITAN Database Studio (SQLite Real)
            </h2>
            <p className="text-xs text-zinc-400">
              Motor relacional SQLite WebAssembly em execução real para modelagem de tabelas, consultas SQL, backup binário .sqlite e exportação JSON.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={handleExportSqliteBinary}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Backup .sqlite
            </button>
          </div>
        </div>

        {/* Table Modeler */}
        <form onSubmit={handleCreateTable} className="grid grid-cols-1 lg:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/80">
          <input
            type="text"
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder="Nome da tabela"
            className="px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
          />
          <input
            type="text"
            value={newColumns}
            onChange={(e) => setNewColumns(e.target.value)}
            placeholder="Colunas DDL"
            className="lg:col-span-2 px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
          />
          <button
            type="submit"
            disabled={!ready}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-white rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-red-500" />
            Criar Tabela
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tables & History Sidebar */}
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 space-y-5">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300">Tabelas Ativas ({tables.length})</h3>
            {tables.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhuma tabela criada.</p>
            ) : (
              <div className="space-y-1">
                {tables.map((t) => (
                  <div key={t} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const q = `SELECT * FROM ${t} LIMIT 50;`;
                        setSqlInput(q);
                        executeSql(q);
                      }}
                      className="text-left text-xs font-mono text-zinc-200 hover:text-red-400 truncate cursor-pointer"
                    >
                      {t}
                    </button>
                    <button
                      type="button"
                      onClick={() => executeSql(`DROP TABLE IF EXISTS ${t};`)}
                      title={`Remover ${t}`}
                      className="text-zinc-600 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-300">Histórico SQL</h3>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {history.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSqlInput(h)}
                  className="w-full text-left text-[11px] font-mono text-zinc-400 hover:text-zinc-100 truncate block cursor-pointer"
                >
                  {h.replace(/\s+/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SQL Editor & Results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800 bg-[#101016] flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                {ready ? 'SQLite Engine Pronta' : 'Carregando WASM...'}
              </span>
              <button
                type="button"
                disabled={!ready}
                onClick={() => executeSql(sqlInput)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Executar SQL
              </button>
            </div>
            <textarea
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full p-4 bg-[#070709] font-mono text-xs sm:text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-950/30 border border-red-800 rounded-lg p-3 text-xs font-mono text-red-300">
              Erro SQL: {errorMsg}
            </div>
          )}

          {results.map((res, idx) => (
            <div key={idx} className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 tabular-nums">
                Resultado #{idx + 1} · {res.values.length} linha(s)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-[#101016] text-zinc-300">
                      {res.columns.map((col) => (
                        <th key={col} className="px-4 py-2 font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {res.values.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-zinc-900/40">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-4 py-2 text-zinc-300 whitespace-nowrap">
                            {cell === null ? 'NULL' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
