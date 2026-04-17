export interface HandoffRecord {
  handoff_id: string;
  run_id: string;
  from_agent: string;
  to_agent: string;
  reason: string;
  artifacts: string[];
}