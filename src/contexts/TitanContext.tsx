import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type {
  AdminKnowledgeDoc,
  AuditLogDoc,
  AutomationJobDoc,
  BackupDoc,
  DeploymentDoc,
  NavSectionId,
  ProjectFileDoc,
  ProjectMemoryDoc,
  SystemCapabilities,
  TaskExecutionDoc,
  WorkspaceProjectDoc,
} from '../shared/titanTypes.ts';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../lib/firebase.ts';
import { fetchCapabilities } from '../lib/titanApi.ts';
import { ensureUserProfile, writeAuditLog } from '../lib/workspaceService.ts';

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface NotificationItem extends ToastNotice {
  createdAt: string;
  read: boolean;
}

interface UserProfileState {
  uid: string;
  displayName: string;
  role: 'engineer' | 'admin';
  defaultDeliveryMode: 'auto' | 'single-file' | 'multi-file';
}

interface TitanContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  userProfile: UserProfileState | null;
  activeNav: NavSectionId;
  setActiveNav: (nav: NavSectionId) => void;
  capabilities: SystemCapabilities | null;
  projects: WorkspaceProjectDoc[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedProjectFiles: ProjectFileDoc[];
  selectedProjectMemories: ProjectMemoryDoc[];
  tasks: TaskExecutionDoc[];
  automations: AutomationJobDoc[];
  deployments: DeploymentDoc[];
  backups: BackupDoc[];
  auditLogs: AuditLogDoc[];
  adminKnowledge: AdminKnowledgeDoc[];
  toasts: ToastNotice[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  notify: (type: ToastNotice['type'], title: string, message: string) => void;
  dismissToast: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const TitanContext = createContext<TitanContextValue | null>(null);

const ADMIN_EMAILS = new Set(['tzudogamer@gmail.com']);

export function TitanProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileState | null>(null);
  const [activeNav, setActiveNav] = useState<NavSectionId>('dashboard');
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [projects, setProjects] = useState<WorkspaceProjectDoc[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectFiles, setSelectedProjectFiles] = useState<ProjectFileDoc[]>([]);
  const [selectedProjectMemories, setSelectedProjectMemories] = useState<ProjectMemoryDoc[]>([]);
  const [tasks, setTasks] = useState<TaskExecutionDoc[]>([]);
  const [automations, setAutomations] = useState<AutomationJobDoc[]>([]);
  const [deployments, setDeployments] = useState<DeploymentDoc[]>([]);
  const [backups, setBackups] = useState<BackupDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDoc[]>([]);
  const [adminKnowledge, setAdminKnowledge] = useState<AdminKnowledgeDoc[]>([]);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const isAdmin = Boolean(
    user?.emailVerified && user.email && ADMIN_EMAILS.has(user.email.toLowerCase()),
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const notify = useCallback(
    (type: ToastNotice['type'], title: string, message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
      setNotifications((prev) => [
        {
          id,
          type,
          title,
          message,
          createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          read: false,
        },
        ...prev.slice(0, 29),
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5500);
    },
    [],
  );

  useEffect(() => {
    fetchCapabilities()
      .then(setCapabilities)
      .catch((err) => {
        console.error('Failed to load system capabilities:', err);
      });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        const adminFlag = Boolean(
          nextUser.emailVerified &&
            nextUser.email &&
            ADMIN_EMAILS.has(nextUser.email.toLowerCase()),
        );
        try {
          await ensureUserProfile(nextUser, adminFlag);
        } catch (err) {
          console.error('Profile init error:', err);
        }
      } else {
        setUserProfile(null);
        setProjects([]);
        setSelectedProjectId(null);
        setSelectedProjectFiles([]);
        setSelectedProjectMemories([]);
        setTasks([]);
        setAutomations([]);
        setDeployments([]);
        setBackups([]);
        setAuditLogs([]);
        setAdminKnowledge([]);
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time listeners gated on authReady && user
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setUserProfile({
            uid: String(d.uid || user.uid),
            displayName: String(d.displayName || user.displayName || 'Engineer'),
            role: d.role === 'admin' ? 'admin' : 'engineer',
            defaultDeliveryMode:
              d.defaultDeliveryMode === 'single-file' || d.defaultDeliveryMode === 'multi-file'
                ? d.defaultDeliveryMode
                : 'auto',
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`),
    );

    const projQuery = query(
      collection(db, 'projects'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(50),
    );
    const unsubProjects = onSnapshot(
      projQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as WorkspaceProjectDoc);
        setProjects(list);
        setSelectedProjectId((curr) => {
          if (curr && list.some((p) => p.id === curr)) return curr;
          return list[0]?.id || null;
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projects'),
    );

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(40),
    );
    const unsubTasks = onSnapshot(
      tasksQuery,
      (snap) => setTasks(snap.docs.map((d) => d.data() as TaskExecutionDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'),
    );

    const autoQuery = query(
      collection(db, 'automations'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(30),
    );
    const unsubAutomations = onSnapshot(
      autoQuery,
      (snap) => setAutomations(snap.docs.map((d) => d.data() as AutomationJobDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'automations'),
    );

    const deployQuery = query(
      collection(db, 'deployments'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(40),
    );
    const unsubDeployments = onSnapshot(
      deployQuery,
      (snap) => setDeployments(snap.docs.map((d) => d.data() as DeploymentDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'deployments'),
    );

    const backupQuery = query(
      collection(db, 'backups'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(40),
    );
    const unsubBackups = onSnapshot(
      backupQuery,
      (snap) => setBackups(snap.docs.map((d) => d.data() as BackupDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'backups'),
    );

    const logsQuery = query(
      collection(db, 'auditLogs'),
      where('actorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => setAuditLogs(snap.docs.map((d) => d.data() as AuditLogDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs'),
    );

    return () => {
      unsubProfile();
      unsubProjects();
      unsubTasks();
      unsubAutomations();
      unsubDeployments();
      unsubBackups();
      unsubLogs();
    };
  }, [authReady, user]);

  // Selected project files + memories listeners
  useEffect(() => {
    if (!authReady || !user || !selectedProjectId) {
      setSelectedProjectFiles([]);
      setSelectedProjectMemories([]);
      return;
    }

    const filesQuery = query(
      collection(db, 'projects', selectedProjectId, 'files'),
      where('ownerId', '==', user.uid),
    );
    const unsubFiles = onSnapshot(
      filesQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ProjectFileDoc)
          .sort((a, b) => a.path.localeCompare(b.path));
        setSelectedProjectFiles(items);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `projects/${selectedProjectId}/files`),
    );

    const memQuery = query(
      collection(db, 'projects', selectedProjectId, 'memories'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(30),
    );
    const unsubMem = onSnapshot(
      memQuery,
      (snap) => {
        setSelectedProjectMemories(snap.docs.map((d) => d.data() as ProjectMemoryDoc));
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `projects/${selectedProjectId}/memories`),
    );

    return () => {
      unsubFiles();
      unsubMem();
    };
  }, [authReady, user, selectedProjectId]);

  // Admin Knowledge Base listener (admin only)
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAdminKnowledge([]);
      return;
    }

    const kbQuery = query(collection(db, 'adminKnowledge'), orderBy('updatedAt', 'desc'), limit(60));
    const unsub = onSnapshot(
      kbQuery,
      (snap) => setAdminKnowledge(snap.docs.map((d) => d.data() as AdminKnowledgeDoc)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'adminKnowledge'),
    );
    return () => unsub();
  }, [authReady, user, isAdmin]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await writeAuditLog({
        actorId: cred.user.uid,
        module: 'auth',
        action: 'google_signin',
        severity: 'info',
        detail: `Sessão autenticada para ${cred.user.email || cred.user.uid}.`,
      });
      notify('success', 'Sessão autenticada', `Bem-vindo ao TITAN CODE, ${cred.user.displayName || 'Engenheiro'}.`);
    } catch (err) {
      notify(
        'error',
        'Falha na autenticação',
        err instanceof Error ? err.message : 'Não foi possível concluir o login Google.',
      );
    }
  }, [notify]);

  const logout = useCallback(async () => {
    await signOut(auth);
    notify('info', 'Sessão encerrada', 'Sua sessão foi desconectada com segurança.');
  }, [notify]);

  return (
    <TitanContext.Provider
      value={{
        user,
        authReady,
        isAdmin,
        userProfile,
        activeNav,
        setActiveNav,
        capabilities,
        projects,
        selectedProjectId,
        setSelectedProjectId,
        selectedProjectFiles,
        selectedProjectMemories,
        tasks,
        automations,
        deployments,
        backups,
        auditLogs,
        adminKnowledge,
        toasts,
        notifications,
        unreadNotificationsCount: notifications.filter((n) => !n.read).length,
        notify,
        dismissToast,
        markAllNotificationsRead,
        clearNotifications,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </TitanContext.Provider>
  );
}

export function useTitan(): TitanContextValue {
  const ctx = useContext(TitanContext);
  if (!ctx) throw new Error('useTitan must be used inside TitanProvider');
  return ctx;
}
