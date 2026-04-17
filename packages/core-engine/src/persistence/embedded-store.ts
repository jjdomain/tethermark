import { SqliteFilePersistenceStore } from "./sqlite-file-store.js";

export class EmbeddedPersistenceStore extends SqliteFilePersistenceStore {
  constructor(rootDir: string) {
    super("embedded", rootDir);
  }
}
