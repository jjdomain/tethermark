import crypto from "node:crypto";

import type {
  AssistantActionExecutionRecord,
  AssistantActionProposalRecord,
  AssistantCitationRecord,
  AssistantMessageRecord,
  AssistantResponse,
  AssistantSessionRecord,
  AssistantStorage
} from "../assistant.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  const db = await openSqliteDatabase(rootDir);
  try {
    ensureSqliteSchema(db);
    return readSqliteTable<T>(db, tableName);
  } finally {
    db.close();
  }
}

export class SqliteAssistantStorage implements AssistantStorage {
  constructor(private readonly rootDirOrOptions?: string | PersistenceReadOptions) {}

  async createSession(input: Omit<AssistantSessionRecord, "id" | "status" | "created_at" | "updated_at">): Promise<AssistantSessionRecord> {
    const location = resolveLocation(this.rootDirOrOptions);
    const now = new Date().toISOString();
    const record: AssistantSessionRecord = {
      ...input,
      id: newId("asst_session"),
      status: "active",
      created_at: now,
      updated_at: now
    };
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "assistant_sessions",
        recordKey: record.id,
        payload: record,
        runId: record.run_id,
        targetId: record.target_id,
        createdAt: record.created_at,
        parentKey: record.scope_id
      });
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return record;
    } finally {
      db.close();
    }
  }

  async getSession(sessionId: string): Promise<AssistantSessionRecord | null> {
    const location = resolveLocation(this.rootDirOrOptions);
    const rows = await readTable<AssistantSessionRecord>(location.rootDir, "assistant_sessions");
    return rows.find((item) => item.id === sessionId) ?? null;
  }

  async listSessions(filter: {
    workspaceId?: string;
    projectId?: string;
    scopeType?: AssistantSessionRecord["scope_type"];
    scopeId?: string;
    status?: AssistantSessionRecord["status"] | "all";
  } = {}): Promise<AssistantSessionRecord[]> {
    const location = resolveLocation(this.rootDirOrOptions);
    const rows = await readTable<AssistantSessionRecord>(location.rootDir, "assistant_sessions");
    return rows
      .filter((item) => !filter.workspaceId || item.workspace_id === filter.workspaceId)
      .filter((item) => !filter.projectId || item.project_id === filter.projectId)
      .filter((item) => !filter.scopeType || item.scope_type === filter.scopeType)
      .filter((item) => !filter.scopeId || item.scope_id === filter.scopeId)
      .filter((item) => filter.status === "all" ? item.status !== "deleted" : item.status === (filter.status || "active"))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.created_at.localeCompare(left.created_at));
  }

  async updateSession(session: AssistantSessionRecord): Promise<AssistantSessionRecord> {
    const location = resolveLocation(this.rootDirOrOptions);
    const record = {
      ...session,
      updated_at: new Date().toISOString()
    };
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "assistant_sessions",
        recordKey: record.id,
        payload: record,
        runId: record.run_id,
        targetId: record.target_id,
        createdAt: record.created_at,
        parentKey: record.scope_id
      });
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return record;
    } finally {
      db.close();
    }
  }

  async listMessages(sessionId: string): Promise<AssistantMessageRecord[]> {
    const location = resolveLocation(this.rootDirOrOptions);
    const rows = await readTable<AssistantMessageRecord>(location.rootDir, "assistant_messages");
    return rows
      .filter((item) => item.session_id === sessionId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }

  async appendMessage(input: Omit<AssistantMessageRecord, "id" | "created_at">): Promise<AssistantMessageRecord> {
    const location = resolveLocation(this.rootDirOrOptions);
    const session = await this.getSession(input.session_id);
    const now = new Date().toISOString();
    const record: AssistantMessageRecord = {
      ...input,
      id: newId("asst_msg"),
      created_at: now
    };
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "assistant_messages",
        recordKey: record.id,
        payload: record,
        runId: session?.run_id,
        targetId: session?.target_id,
        createdAt: record.created_at,
        parentKey: record.session_id
      });
      if (session) {
        upsertSqliteRecord({
          db,
          tableName: "assistant_sessions",
          recordKey: session.id,
          payload: { ...session, updated_at: now },
          runId: session.run_id,
          targetId: session.target_id,
          createdAt: session.created_at,
          parentKey: session.scope_id
        });
      }
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return record;
    } finally {
      db.close();
    }
  }

  async persistResponseArtifacts(args: {
    sessionId: string;
    messageId: string;
    response: AssistantResponse;
  }): Promise<{ citations: AssistantCitationRecord[]; actions: AssistantActionProposalRecord[] }> {
    const location = resolveLocation(this.rootDirOrOptions);
    const session = await this.getSession(args.sessionId);
    const now = new Date().toISOString();
    const citations = args.response.citations.map((citation, index): AssistantCitationRecord => ({
      ...citation,
      id: `${args.messageId}:citation:${index}:${citation.citation_type}:${citation.id}`,
      session_id: args.sessionId,
      message_id: args.messageId,
      created_at: now
    }));
    const actions = args.response.proposed_actions.map((action): AssistantActionProposalRecord => ({
      id: action.id,
      session_id: args.sessionId,
      message_id: args.messageId,
      action_type: action.action_type,
      capability: action.capability,
      status: "proposed",
      title: action.title,
      summary: action.summary,
      requires_confirmation: action.requires_confirmation,
      hosted_only: action.hosted_only,
      payload_json: action.payload_json,
      created_at: now,
      resolved_at: null,
      resolved_by: null
    }));
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      for (const citation of citations) {
        upsertSqliteRecord({
          db,
          tableName: "assistant_citations",
          recordKey: citation.id,
          payload: citation,
          runId: citation.run_id ?? session?.run_id,
          targetId: session?.target_id,
          createdAt: citation.created_at,
          parentKey: args.messageId
        });
      }
      for (const action of actions) {
        upsertSqliteRecord({
          db,
          tableName: "assistant_action_proposals",
          recordKey: action.id,
          payload: action,
          runId: session?.run_id,
          targetId: session?.target_id,
          createdAt: action.created_at,
          parentKey: args.messageId
        });
      }
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return { citations, actions };
    } finally {
      db.close();
    }
  }

  async getActionProposal(sessionId: string, actionId: string): Promise<AssistantActionProposalRecord | null> {
    const location = resolveLocation(this.rootDirOrOptions);
    const rows = await readTable<AssistantActionProposalRecord>(location.rootDir, "assistant_action_proposals");
    return rows.find((item) => item.session_id === sessionId && item.id === actionId) ?? null;
  }

  async updateActionProposal(action: AssistantActionProposalRecord): Promise<AssistantActionProposalRecord> {
    const location = resolveLocation(this.rootDirOrOptions);
    const session = await this.getSession(action.session_id);
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "assistant_action_proposals",
        recordKey: action.id,
        payload: action,
        runId: session?.run_id,
        targetId: session?.target_id,
        createdAt: action.created_at,
        parentKey: action.message_id
      });
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return action;
    } finally {
      db.close();
    }
  }

  async createActionExecution(input: Omit<AssistantActionExecutionRecord, "id" | "created_at">): Promise<AssistantActionExecutionRecord> {
    const location = resolveLocation(this.rootDirOrOptions);
    const session = await this.getSession(input.session_id);
    const record: AssistantActionExecutionRecord = {
      ...input,
      id: newId("asst_exec"),
      created_at: new Date().toISOString()
    };
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "assistant_action_executions",
        recordKey: record.id,
        payload: record,
        runId: session?.run_id,
        targetId: session?.target_id,
        createdAt: record.created_at,
        parentKey: record.action_id
      });
      await saveSqliteDatabase(location.rootDir, db, location.mode);
      return record;
    } finally {
      db.close();
    }
  }
}
