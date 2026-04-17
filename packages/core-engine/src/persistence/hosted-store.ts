import { SqliteFilePersistenceStore } from "./sqlite-file-store.js";

export class HostedPersistenceStore extends SqliteFilePersistenceStore {
  constructor(rootDir: string) {
    super("hosted", rootDir);
  }
}
