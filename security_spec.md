# TITAN CODE — Firestore Security Specification

## 1. Data Invariants
1. **User Isolation**: Every `/users/{userId}` document belongs strictly to `userId == request.auth.uid` (or an explicit admin). Non-admins can never self-assign `role: 'admin'`.
2. **Project Ownership**: Every `/projects/{projectId}` has an immutable `ownerId == request.auth.uid` and valid `projectType`, `language`, `status`.
3. **Master Gate for Project Files**: A file in `/projects/{projectId}/files/{fileId}` can only be read, created, updated, or deleted if the parent `/projects/{projectId}` exists and belongs to `request.auth.uid`.
4. **AI Session & Message Isolation**: `/aiSessions/{sessionId}` and `/aiSessions/{sessionId}/messages/{messageId}` are strictly owned by `ownerId == request.auth.uid`.
5. **Admin Knowledge Gate**: `/adminKnowledge/{entryId}` is readable and writable exclusively by verified administrators (`isAdmin()`).
6. **Automation & Task Integrity**: `/automations/{jobId}` and `/tasks/{taskId}` enforce strict `ownerId == request.auth.uid`, bounded strings, and immutable `createdAt`/`ownerId`.
7. **Audit Logs**: `/auditLogs/{logId}` can be created by verified users for their own `actorId == request.auth.uid` and read only by the actor or an admin; logs are immutable (no update/delete).

## 2. Adversarial "Dirty Dozen" Payloads Blocked by Rules
1. **Privilege Escalation on Signup**: Creating `/users/{uid}` with `role: 'admin'` by non-admin -> `PERMISSION_DENIED`.
2. **Shadow Field Injection**: Creating/updating `/projects/{id}` with an undocumented `isPremium: true` key -> `PERMISSION_DENIED`.
3. **Owner Spoofing**: Creating `/projects/{id}` with `ownerId: 'victim_uid'` -> `PERMISSION_DENIED`.
4. **Orphaned File Write**: Creating `/projects/nonexistent/files/f1` without a valid parent project -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Writing to `/projects/invalid$id!with*badchars` or >128 chars -> `PERMISSION_DENIED`.
6. **Temporal Forgery**: Supplying a backdated `createdAt` or `updatedAt` instead of `request.time` -> `PERMISSION_DENIED`.
7. **Immutable Owner Tampering**: Updating `ownerId` on an existing `/projects/{id}` -> `PERMISSION_DENIED`.
8. **Admin Knowledge Tampering**: Non-admin attempting `create` or `list` on `/adminKnowledge` -> `PERMISSION_DENIED`.
9. **Blanket Query Scraping**: Querying `collection(db, 'projects')` without `where('ownerId', '==', uid)` -> `PERMISSION_DENIED`.
10. **Audit Log Tampering**: Attempting `update` or `delete` on `/auditLogs/{logId}` -> `PERMISSION_DENIED`.
11. **Oversized Content Exhaustion**: Writing `content` > 200,000 chars on `ProjectFile` or `title` > 160 chars -> `PERMISSION_DENIED`.
12. **Unverified Email Bypass**: Accessing collections when `request.auth.token.email_verified != true` -> `PERMISSION_DENIED`.
