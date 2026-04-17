import { SqliteFilePersistenceStore } from "./sqlite-file-store.js";

export class LocalPersistenceStore extends SqliteFilePersistenceStore {
  constructor(rootDir: string) {
    super("local", rootDir);
  }
}
