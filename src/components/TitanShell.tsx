import {
  Activity,
  Bell,
  Bot,
  Box,
  Bug,
  Cloud,
  Code2,
  Cpu,
  Database,
  FlaskConical,
  FolderArchive,
  FolderGit2,
  Gamepad2,
  Gauge,
  GitBranch,
  Globe,
  Hammer,
  HeartPulse,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PackagePlus,
  PlugZap,
  Search,
  ServerCog,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import type { NavSectionId } from '../shared/titanTypes.ts';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallPrompt.tsx';

const LOGO_URL = '/src/assets/images/titan_logo_mark_1794849192932.jpg';
const HERO_URL = '/src/assets/images/titan_hero_banner_1794849193393.jpg';
const DEFAULT_AVATAR_URL = '/src/assets/images/titan_avatar_architect_1794849194380.jpg';

interface NavGroup {
  label: string;
  items: Array<{ id: NavSectionId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Núcleo & IA',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'titan-ai', label: 'Titan Core AI', icon: Cpu },
      { id: 'ai-orchestrator', label: 'AI Orchestrator', icon: Layers },
      { id: 'agents', label: 'Agents', icon: Bot },
    ],
  },
  {
    label: 'Engenharia & Apps',
    items: [
      { id: 'script-studio', label: 'Script Studio', icon: TerminalSquare },
      { id: 'project-builder', label: 'Project Builder', icon: Box },
      { id: 'code-generator', label: 'Code Generator', icon: Code2 },
      { id: 'luau-lab', label: 'Luau Lab', icon: Gamepad2 },
      { id: 'apk-builder', label: 'APK Builder', icon: Smartphone },
      { id: 'web-to-apk', label: 'Web-to-APK', icon: PackagePlus },
    ],
  },
  {
    label: 'Estúdios & Qualidade',
    items: [
      { id: 'web-studio', label: 'Web Studio', icon: Globe },
      { id: 'database-studio', label: 'Database Studio', icon: Database },
      { id: 'api-studio', label: 'API Studio', icon: Network },
      { id: 'debugger', label: 'Debugger Pro', icon: Bug },
      { id: 'quality-engine', label: 'Quality & Healing', icon: HeartPulse },
      { id: 'test-lab', label: 'Test Lab', icon: FlaskConical },
      { id: 'toolbox', label: 'Toolbox', icon: Wrench },
    ],
  },
  {
    label: 'Cloud & Deploy',
    items: [
      { id: 'deploy-center', label: 'Deploy Center', icon: Cloud },
      { id: 'performance-engine', label: 'Performance Engine', icon: Gauge },
      { id: 'git-control', label: 'Git Control', icon: GitBranch },
      { id: 'cloud-files', label: 'Cloud Files & Backup', icon: FolderArchive },
      { id: 'integrations-center', label: 'Integrations Center', icon: PlugZap },
    ],
  },
  {
    label: 'Operações & Controle',
    items: [
      { id: 'workspace', label: 'Workspace IDE', icon: FolderGit2 },
      { id: 'automation-center', label: 'Automation & Queue', icon: Activity },
      { id: 'control-center', label: 'Control Center', icon: ServerCog },
      { id: 'security-center', label: 'Security Center', icon: ShieldAlert },
      { id: 'administration', label: 'Admin AI', icon: ShieldCheck },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const NAV_TITLES: Record<NavSectionId, string> = {
  dashboard: 'Dashboard',
  'titan-ai': 'Titan Core AI',
  'ai-orchestrator': 'AI Orchestrator',
  'script-studio': 'Script Studio',
  'project-builder': 'Project Builder',
  'code-generator': 'Code Generator 2.0',
  'luau-lab': 'Luau Lab 2.0',
  'apk-builder': 'APK Builder 2.0',
  'web-to-apk': 'Web-to-APK Builder',
  'web-studio': 'Web Studio',
  'database-studio': 'Database Studio',
  'api-studio': 'API Studio',
  debugger: 'Debugger Pro',
  'quality-engine': 'Quality & Self-Healing',
  'test-lab': 'Test Lab',
  toolbox: 'Toolbox',
  'deploy-center': 'Deploy Center',
  'performance-engine': 'Performance Engine',
  'control-center': 'Control Center',
  'security-center': 'Security Center',
  'git-control': 'Git & Version Control',
  'cloud-files': 'Cloud Files & Backups',
  'automation-center': 'Automation & Queue Center',
  'integrations-center': 'Integrations & Multi-AI',
  agents: 'Agents',
  workspace: 'Workspace Live IDE',
  administration: 'Admin AI & Governance',
  settings: 'Settings',
};

export function TitanBrandMark({ size = 32 }: { size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0"
      >
        <Hammer className="w-4 h-4 text-red-500" />
      </div>
    );
  }

  return (
    <img
      src={LOGO_URL}
      alt="TITAN CODE"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      style={{ width: size, height: size }}
      className="rounded-lg object-cover border border-zinc-800 shrink-0"
    />
  );
}

export function TitanShell({ children }: { children: React.ReactNode }) {
  const {
    user,
    authReady,
    isAdmin,
    userProfile,
    activeNav,
    setActiveNav,
    projects,
    setSelectedProjectId,
    toasts,
    notifications,
    unreadNotificationsCount,
    dismissToast,
    markAllNotificationsRead,
    clearNotifications,
    signInWithGoogle,
    logout,
  } = useTitan();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const allNavItems = useMemo(
    () => NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label }))),
    [],
  );

  const filteredModules = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return allNavItems.slice(0, 12);
    return allNavItems.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q),
    );
  }, [allNavItems, paletteQuery]);

  const filteredProjects = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return projects.slice(0, 5);
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.language.toLowerCase().includes(q) ||
        p.environment.toLowerCase().includes(q),
    );
  }, [projects, paletteQuery]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#070709] flex flex-col items-center justify-center p-6 gap-5">
        <TitanBrandMark size={64} />
        <div className="text-center space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-100">
            TITAN CODE
          </h1>
          <p className="text-sm text-zinc-400">Inicializando ambiente de engenharia...</p>
        </div>
        <div className="w-48 h-1 bg-zinc-900 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-red-600 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col lg:flex-row">
        <div className="lg:w-1/2 relative overflow-hidden bg-[#0B0B0F] border-b lg:border-b-0 lg:border-r border-zinc-800/80 flex flex-col justify-between p-8 lg:p-14 min-h-[300px]">
          {!heroImgError && (
            <img
              src={HERO_URL}
              alt="Arquitetura TITAN CODE"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-35"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/65 to-transparent" />

          <div className="relative z-10 flex items-center gap-3">
            <TitanBrandMark size={40} />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              TITAN CODE
            </span>
          </div>

          <div className="relative z-10 max-w-xl space-y-4 my-10 lg:my-0">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white [text-wrap:balance]">
              Ecossistema autônomo de engenharia, Cloud Deploy, Web-to-APK e IA multi-provedor.
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-lg">
              28 módulos integrados: Script Studio validado, Deploy Center, Web-to-APK/TWA, Self-Healing, Git Control, Test Lab, Security Center e Workspace Live IDE.
            </p>
          </div>

          <div className="relative z-10 text-xs text-zinc-400 flex flex-wrap items-center gap-3">
            <span>Engineered to Create</span>
            <span aria-hidden="true">·</span>
            <span>Built to Deploy</span>
            <span aria-hidden="true">·</span>
            <span>© 2026 VZYN</span>
          </div>
        </div>

        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-14">
          <div className="w-full max-w-md bg-[#0E0E13] border border-zinc-800 rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold text-white">
                Acessar Workstation
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Autentique-se com sua conta Google para sincronizar projetos no Workspace, deploys, backups SHA-256 e provedores de IA.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full min-h-[44px] px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Entrar com Google</span>
            </button>

            <div className="pt-4 border-t border-zinc-800/80 text-xs text-zinc-500 space-y-1.5">
              <p>Autenticação gerenciada via Firebase Authentication e Firestore.</p>
              <p>Cofre AES-256-GCM e execução isolada protegidos no servidor.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectNav = (id: NavSectionId) => {
    setActiveNav(id);
    setMobileMenuOpen(false);
    setPaletteOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0A0A0E] border-r border-zinc-800/80 z-30">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-zinc-800/80 shrink-0">
          <TitanBrandMark size={30} />
          <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            TITAN CODE
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-medium text-zinc-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                      active
                        ? 'bg-red-600/15 text-white border border-red-600/40'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-red-500' : 'text-zinc-500'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={user.photoURL || DEFAULT_AVATAR_URL}
              alt={userProfile?.displayName || 'Usuário'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">
                {userProfile?.displayName || user.displayName || 'Engenheiro'}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">
                {isAdmin ? 'Admin' : 'Engineer'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title="Sair"
            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0A0A0E] border-r border-zinc-800 flex flex-col h-full z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <TitanBrandMark size={28} />
                <span className="font-display text-base font-bold text-white">
                  TITAN CODE
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-3 pb-1 text-xs font-medium text-zinc-500">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeNav === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectNav(item.id)}
                        className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                          active
                            ? 'bg-red-600/15 text-white border border-red-600/40'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            active ? 'text-red-500' : 'text-zinc-500'
                          }`}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-400 truncate">{user.email}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-[44px] px-3 text-xs text-red-400 hover:text-red-300 font-medium"
              >
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
        <header className="sticky top-0 z-20 h-14 lg:h-16 bg-[#070709]/95 backdrop-blur border-b border-zinc-800/80 px-3 sm:px-4 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir navegação"
              className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-zinc-500 hidden sm:inline whitespace-nowrap">
                TITAN CODE
              </span>
              <span className="text-zinc-600 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-zinc-100 truncate max-w-[140px] sm:max-w-none">
                {NAV_TITLES[activeNav]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <OfflineIndicator />
            <PWAInstallButton />

            {/* Global Search / Command Palette Trigger */}
            <button
              type="button"
              onClick={() => {
                setPaletteQuery('');
                setPaletteOpen(true);
              }}
              aria-label="Busca global e Command Palette"
              className="min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs text-zinc-300 inline-flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden md:inline">Buscar / Comandos</span>
              <kbd className="hidden xl:inline px-1.5 py-0.5 text-[10px] font-mono bg-[#070709] border border-zinc-800 rounded text-zinc-500">
                Ctrl+K
              </kbd>
            </button>

            {/* Notifications Center Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  markAllNotificationsRead();
                }}
                aria-label="Notificações"
                className="relative min-w-[36px] min-h-[36px] p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-[#0E0E13] border border-zinc-800 rounded-xl shadow-2xl z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Notificações ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={clearNotifications}
                      className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/70">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-zinc-500 text-center">
                        Nenhuma notificação nesta sessão.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-3 space-y-0.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-200">{n.title}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{n.createdAt}</span>
                          </div>
                          <p className="text-zinc-400 break-words">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('script-studio')}
              className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="sm:hidden">+ Script</span>
              <span className="hidden sm:inline">Novo Script</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>

        <footer className="border-t border-zinc-900 px-4 sm:px-6 py-4 text-xs text-zinc-600 flex flex-wrap items-center justify-between gap-2">
          <span>© 2026 TITAN CODE · Todos os direitos reservados à equipe VZYN</span>
          <span className="font-mono text-[11px] text-zinc-700">VZYN ENGINEERING CORE · 28 MÓDULOS</span>
        </footer>
      </div>

      {/* Global Command Palette Modal (Ctrl+K) */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-[#0C0C10] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
              <Search className="w-4 h-4 text-red-500 shrink-0" />
              <input
                type="text"
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Ir para módulo, buscar projeto ou executar comando..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2 space-y-3">
              {filteredProjects.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[11px] font-medium text-zinc-500">
                    Projetos no Workspace
                  </div>
                  {filteredProjects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        selectNav('workspace');
                      }}
                      className="w-full px-3 py-2 rounded-lg hover:bg-zinc-900 flex items-center justify-between text-left text-xs cursor-pointer"
                    >
                      <span className="font-medium text-zinc-200 truncate">{proj.name}</span>
                      <span className="font-mono text-[11px] text-zinc-500 ml-2 shrink-0">
                        {proj.language} · {proj.environment}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="px-3 py-1 text-[11px] font-medium text-zinc-500">
                  Módulos TITAN CODE
                </div>
                {filteredModules.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-zinc-500">Nenhum módulo encontrado.</p>
                ) : (
                  filteredModules.map((mod) => {
                    const Icon = mod.icon;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => selectNav(mod.id)}
                        className="w-full px-3 py-2 rounded-lg hover:bg-zinc-900 flex items-center justify-between text-left text-xs cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5 text-zinc-200">
                          <Icon className="w-4 h-4 text-red-500" />
                          <span className="font-medium">{mod.label}</span>
                        </span>
                        <span className="text-[11px] text-zinc-500">{mod.group}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 bg-[#0E0E13] shadow-lg flex items-start justify-between gap-3 ${
              t.type === 'error'
                ? 'border-red-700/70'
                : t.type === 'warning'
                ? 'border-amber-700/70'
                : t.type === 'success'
                ? 'border-emerald-700/70'
                : 'border-zinc-700'
            }`}
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-zinc-100">{t.title}</p>
              <p className="text-xs text-zinc-400 break-words">{t.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-zinc-500 hover:text-zinc-200 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
