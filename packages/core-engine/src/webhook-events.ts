import { createHmac, randomUUID } from "node:crypto";

import type { PersistedWebhookDeliveryRecord } from "./persistence/contracts.js";
import { createPersistedWebhookDelivery } from "./persistence/webhook-deliveries.js";
import type { PersistenceReadOptions } from "./persistence/backend.js";

export interface WebhookRunRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  target_id: string;
}

export type GenericWebhookEventType =
  | "run_completed"
  | "review_required"
  | "review_requires_rerun"
  | "outbound_delivery_sent"
  | "outbound_delivery_failed";

export interface GenericWebhookEventEnvelope {
  version: "2026-04-16";
  event_id: string;
  event_type: GenericWebhookEventType;
  occurred_at: string;
  workspace_id: string;
  project_id: string;
  run_id: string;
  target_id: string;
  triggered_by: string | null;
  summary: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface GenericWebhookConfig {
  url: string | null;
  events: GenericWebhookEventType[];
  secret: string | null;
}

export function normalizeGenericWebhookConfig(integrations: Record<string, unknown> | null | undefined): GenericWebhookConfig {
  const rawEvents = Array.isArray(integrations?.generic_webhook_events)
    ? integrations?.generic_webhook_events
    : [];
  return {
    url: typeof integrations?.generic_webhook_url === "string" && integrations.generic_webhook_url.trim()
      ? integrations.generic_webhook_url.trim()
      : null,
    events: rawEvents
      .map((item) => String(item))
      .filter((item): item is GenericWebhookEventType => [
        "run_completed",
        "review_required",
        "review_requires_rerun",
        "outbound_delivery_sent",
        "outbound_delivery_failed"
      ].includes(item)),
    secret: typeof integrations?.generic_webhook_secret === "string" && integrations.generic_webhook_secret
      ? integrations.generic_webhook_secret
      : null
  };
}

export async function emitGenericWebhookEvent(args: {
  config: GenericWebhookConfig;
  run: WebhookRunRecord;
  eventType: GenericWebhookEventType;
  summary: Record<string, unknown>;
  data?: Record<string, unknown>;
  triggeredBy?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedWebhookDeliveryRecord | null> {
  if (!args.config.url || !args.config.events.includes(args.eventType)) {
    return null;
  }
  const occurredAt = new Date().toISOString();
  const eventId = `webhook:${args.run.id}:${args.eventType}:${randomUUID()}`;
  const envelope: GenericWebhookEventEnvelope = {
    version: "2026-04-16",
    event_id: eventId,
    event_type: args.eventType,
    occurred_at: occurredAt,
    workspace_id: args.run.workspace_id,
    project_id: args.run.project_id,
    run_id: args.run.id,
    target_id: args.run.target_id,
    triggered_by: args.triggeredBy ?? null,
    summary: args.summary,
    data: args.data ?? {}
  };
  const body = JSON.stringify(envelope);
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-harness-event-type": args.eventType,
    "x-harness-event-id": eventId
  };
  if (args.config.secret) {
    headers["x-harness-signature"] = `sha256=${createHmac("sha256", args.config.secret).update(body).digest("hex")}`;
  }

  let record: PersistedWebhookDeliveryRecord;
  try {
    const response = await fetch(args.config.url, {
      method: "POST",
      headers,
      body
    });
    const text = await response.text().catch(() => "");
    record = {
      id: eventId,
      run_id: args.run.id,
      workspace_id: args.run.workspace_id,
      project_id: args.run.project_id,
      event_type: args.eventType,
      target_url: args.config.url,
      status: response.ok ? "sent" : "failed",
      http_status: response.status,
      response_summary: text.slice(0, 400) || response.statusText || null,
      attempted_at: occurredAt,
      triggered_by: args.triggeredBy ?? null,
      payload_json: envelope
    };
  } catch (error) {
    record = {
      id: eventId,
      run_id: args.run.id,
      workspace_id: args.run.workspace_id,
      project_id: args.run.project_id,
      event_type: args.eventType,
      target_url: args.config.url,
      status: "failed",
      http_status: null,
      response_summary: error instanceof Error ? error.message : String(error),
      attempted_at: occurredAt,
      triggered_by: args.triggeredBy ?? null,
      payload_json: envelope
    };
  }

  await createPersistedWebhookDelivery(record, args.rootDirOrOptions);
  return record;
}
