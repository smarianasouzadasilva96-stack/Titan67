import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type {
  AutomationJobDoc,
  DeployEnvironment,
  DeployProviderId,
  DeployStatus,
  FileKind,
  GeneratedFileItem,
  ProjectType,
  TaskState,
} from '../shared/titanTypes.ts';
import { OperationType, db, handleFirestoreError } from './firebase.ts';

function safeId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${rand}`;
}

export async function computeSha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function ensureUserProfile(user: User, isAdmin: boolean): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: (user.displayName || user.email?.split('@')[0] || 'Engineer').slice(0, 120),
        photoURL: (user.photoURL || '').slice(0, 512),
        role: isAdmin ? 'admin' : 'engineer',
        defaultDeliveryMode: 'auto',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserDeliveryMode(
  uid: string,
  displayName: string,
  defaultDeliveryMode: 'auto' | 'single-file' | 'multi-file',
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName.slice(0, 120),
      defaultDeliveryMode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveProjectToWorkspace(params: {
  ownerId: string;
  name: string;
  description: string;
  projectType: ProjectType;
  language: string;
  environment: string;
  status: TaskState;
  files: GeneratedFileItem[];
}): Promise<string> {
  const projectId = safeId('proj');
  const projectPath = `projects/${projectId}`;

  try {
    const batch = writeBatch(db);
    const projectRef = doc(db, 'projects', projectId);

    batch.set(projectRef, {
      id: projectId,
      ownerId: params.ownerId,
      name: params.name.slice(0, 140),
      description: params.description.slice(0, 1000),
      projectType: params.projectType,
      language: params.language.slice(0, 48),
      environment: params.environment.slice(0, 64),
      status: params.status,
      filesCount: params.files.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const file of params.files.slice(0, 50)) {
      const fileId = safeId('file');
      const fileRef = doc(db, 'projects', projectId, 'files', fileId);
      batch.set(fileRef, {
        id: fileId,
        projectId,
        ownerId: params.ownerId,
        path: file.path.slice(0, 260),
        content: file.content.slice(0, 200000),
        language: file.language.slice(0, 48),
        fileKind: file.fileKind,
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return projectId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, projectPath);
  }
}

export async function addOrUpdateProjectFile(params: {
  projectId: string;
  ownerId: string;
  fileId?: string;
  path: string;
  content: string;
  language: string;
  fileKind: FileKind;
  currentVersion?: number;
  currentFilesCount?: number;
}): Promise<string> {
  const fileId = params.fileId || safeId('file');
  const fullPath = `projects/${params.projectId}/files/${fileId}`;

  try {
    if (params.fileId) {
      await updateDoc(doc(db, 'projects', params.projectId, 'files', fileId), {
        path: params.path.slice(0, 260),
        content: params.content.slice(0, 200000),
        language: params.language.slice(0, 48),
        fileKind: params.fileKind,
        version: (params.currentVersion || 1) + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      const batch = writeBatch(db);
      batch.set(doc(db, 'projects', params.projectId, 'files', fileId), {
        id: fileId,
        projectId: params.projectId,
        ownerId: params.ownerId,
        path: params.path.slice(0, 260),
        content: params.content.slice(0, 200000),
        language: params.language.slice(0, 48),
        fileKind: params.fileKind,
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (typeof params.currentFilesCount === 'number') {
        batch.update(doc(db, 'projects', params.projectId), {
          filesCount: params.currentFilesCount + 1,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return fileId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, fullPath);
  }
}

export async function deleteProjectFile(
  projectId: string,
  fileId: string,
  currentFilesCount: number,
): Promise<void> {
  const fullPath = `projects/${projectId}/files/${fileId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'projects', projectId, 'files', fileId));
    batch.update(doc(db, 'projects', projectId), {
      filesCount: Math.max(0, currentFilesCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, fullPath);
  }
}

export async function renameProject(projectId: string, name: string, description: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      name: name.slice(0, 140),
      description: description.slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteProjectRecursive(projectId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    const [filesSnap, memSnap] = await Promise.all([
      getDocs(collection(db, 'projects', projectId, 'files')),
      getDocs(collection(db, 'projects', projectId, 'memories')),
    ]);
    const batch = writeBatch(db);
    filesSnap.forEach((f) => batch.delete(f.ref));
    memSnap.forEach((m) => batch.delete(m.ref));
    batch.delete(doc(db, 'projects', projectId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Phase 9: Context & Memory Engine ---
export async function saveProjectMemory(params: {
  projectId: string;
  ownerId: string;
  decisionTitle: string;
  requirements: string;
}): Promise<string> {
  const memoryId = safeId('mem');
  const path = `projects/${params.projectId}/memories/${memoryId}`;
  try {
    await setDoc(doc(db, 'projects', params.projectId, 'memories', memoryId), {
      id: memoryId,
      projectId: params.projectId,
      ownerId: params.ownerId,
      decisionTitle: params.decisionTitle.slice(0, 160),
      requirements: params.requirements.slice(0, 20000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return memoryId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteProjectMemory(projectId: string, memoryId: string): Promise<void> {
  const path = `projects/${projectId}/memories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId, 'memories', memoryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createAiSession(params: {
  ownerId: string;
  module: 'core-ai' | 'admin-ai' | 'script-studio' | 'project-builder' | 'luau-lab' | 'agent' | 'orchestrator';
  title: string;
  agentId?: string;
}): Promise<string> {
  const sessionId = safeId('sess');
  const path = `aiSessions/${sessionId}`;
  try {
    await setDoc(doc(db, 'aiSessions', sessionId), {
      id: sessionId,
      ownerId: params.ownerId,
      module: params.module,
      title: params.title.slice(0, 160),
      ...(params.agentId ? { agentId: params.agentId.slice(0, 64) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function appendAiMessage(params: {
  sessionId: string;
  ownerId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelUsed?: string;
}): Promise<string> {
  const messageId = safeId('msg');
  const path = `aiSessions/${params.sessionId}/messages/${messageId}`;
  try {
    await setDoc(doc(db, 'aiSessions', params.sessionId, 'messages', messageId), {
      id: messageId,
      sessionId: params.sessionId,
      ownerId: params.ownerId,
      role: params.role,
      content: params.content.slice(0, 120000),
      ...(params.modelUsed ? { modelUsed: params.modelUsed.slice(0, 64) } : {}),
      createdAt: serverTimestamp(),
    });
    return messageId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function recordTaskExecution(params: {
  ownerId: string;
  module: string;
  prompt: string;
  language: string;
  environment: string;
  status: TaskState;
  validationSummary: string;
}): Promise<string> {
  const taskId = safeId('task');
  const path = `tasks/${taskId}`;
  try {
    await setDoc(doc(db, 'tasks', taskId), {
      id: taskId,
      ownerId: params.ownerId,
      module: params.module.slice(0, 64),
      prompt: params.prompt.slice(0, 8000),
      language: params.language.slice(0, 48),
      environment: params.environment.slice(0, 64),
      status: params.status,
      validationSummary: params.validationSummary.slice(0, 4000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return taskId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function createAutomationJob(params: {
  ownerId: string;
  name: string;
  actionType: AutomationJobDoc['actionType'];
  targetProjectId?: string;
}): Promise<string> {
  const jobId = safeId('auto');
  const path = `automations/${jobId}`;
  try {
    await setDoc(doc(db, 'automations', jobId), {
      id: jobId,
      ownerId: params.ownerId,
      name: params.name.slice(0, 140),
      actionType: params.actionType,
      ...(params.targetProjectId ? { targetProjectId: params.targetProjectId.slice(0, 128) } : {}),
      status: 'IDLE',
      lastRunSummary: 'Aguardando execução.',
      runCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return jobId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAutomationRun(params: {
  jobId: string;
  status: AutomationJobDoc['status'];
  lastRunSummary: string;
  runCount: number;
}): Promise<void> {
  const path = `automations/${params.jobId}`;
  try {
    await updateDoc(doc(db, 'automations', params.jobId), {
      status: params.status,
      lastRunSummary: params.lastRunSummary.slice(0, 4000),
      runCount: params.runCount,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAutomationJob(jobId: string): Promise<void> {
  const path = `automations/${jobId}`;
  try {
    await deleteDoc(doc(db, 'automations', jobId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Phase 2: Deployment History & Status ---
export async function saveDeploymentRecord(params: {
  ownerId: string;
  projectId: string;
  projectName: string;
  provider: DeployProviderId;
  environment: DeployEnvironment;
  status: DeployStatus;
  version: string;
  url?: string;
  domain?: string;
  logsSummary?: string;
  responseTimeMs?: number;
}): Promise<string> {
  const deployId = safeId('dep');
  const path = `deployments/${deployId}`;
  try {
    await setDoc(doc(db, 'deployments', deployId), {
      id: deployId,
      ownerId: params.ownerId,
      projectId: params.projectId,
      projectName: params.projectName.slice(0, 140),
      provider: params.provider,
      environment: params.environment,
      status: params.status,
      version: params.version.slice(0, 32),
      ...(params.url ? { url: params.url.slice(0, 512) } : {}),
      ...(params.domain ? { domain: params.domain.slice(0, 256) } : {}),
      ...(params.logsSummary ? { logsSummary: params.logsSummary.slice(0, 8000) } : {}),
      ...(typeof params.responseTimeMs === 'number' ? { responseTimeMs: Math.round(params.responseTimeMs) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return deployId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateDeploymentStatus(params: {
  deployId: string;
  status: DeployStatus;
  url?: string;
  logsSummary?: string;
  responseTimeMs?: number;
}): Promise<void> {
  const path = `deployments/${params.deployId}`;
  try {
    await updateDoc(doc(db, 'deployments', params.deployId), {
      status: params.status,
      ...(params.url ? { url: params.url.slice(0, 512) } : {}),
      ...(params.logsSummary ? { logsSummary: params.logsSummary.slice(0, 8000) } : {}),
      ...(typeof params.responseTimeMs === 'number' ? { responseTimeMs: Math.round(params.responseTimeMs) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Phase 15 & 21: Project Backups with SHA-256 ---
export async function createProjectBackup(params: {
  ownerId: string;
  projectId: string;
  projectName: string;
  label: string;
  files: Array<{ path: string; content: string; language: string; fileKind: FileKind }>;
}): Promise<{ backupId: string; sha256: string }> {
  const backupId = safeId('bkp');
  const path = `backups/${backupId}`;
  const payloadJson = JSON.stringify(params.files).slice(0, 449000);
  const sha256 = await computeSha256Hex(payloadJson);

  try {
    await setDoc(doc(db, 'backups', backupId), {
      id: backupId,
      ownerId: params.ownerId,
      projectId: params.projectId,
      projectName: params.projectName.slice(0, 140),
      label: params.label.slice(0, 140),
      sha256,
      filesCount: params.files.length,
      payloadJson,
      createdAt: serverTimestamp(),
    });
    return { backupId, sha256 };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteProjectBackup(backupId: string): Promise<void> {
  const path = `backups/${backupId}`;
  try {
    await deleteDoc(doc(db, 'backups', backupId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function createAdminKnowledgeEntry(params: {
  authorId: string;
  title: string;
  category: string;
  content: string;
}): Promise<string> {
  const entryId = safeId('kb');
  const path = `adminKnowledge/${entryId}`;
  try {
    await setDoc(doc(db, 'adminKnowledge', entryId), {
      id: entryId,
      authorId: params.authorId,
      title: params.title.slice(0, 160),
      category: params.category.slice(0, 64),
      content: params.content.slice(0, 20000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return entryId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteAdminKnowledgeEntry(entryId: string): Promise<void> {
  const path = `adminKnowledge/${entryId}`;
  try {
    await deleteDoc(doc(db, 'adminKnowledge', entryId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function writeAuditLog(params: {
  actorId: string;
  module: string;
  action: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  detail: string;
}): Promise<void> {
  const logId = safeId('log');
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      actorId: params.actorId,
      module: params.module.slice(0, 64),
      action: params.action.slice(0, 120),
      severity: params.severity,
      detail: params.detail.slice(0, 2000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
