import fs from "node:fs/promises";
import path from "node:path";

const MAX_ARCHIVE_ENTRIES = 4096;
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;

export function assertSafeArchiveListing(listing: string, verboseListing = ""): void {
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("archive_entry_count_invalid");
  for (const rawEntry of entries) {
    const entry = rawEntry.replace(/\\/g, "/");
    const segments = entry.split("/");
    if (entry.length > 1024
      || entry.startsWith("/")
      || /^[A-Za-z]:\//.test(entry)
      || segments.includes("..")
      || /[\u0000-\u001f\u007f]/.test(entry)) {
      throw new Error(`archive_entry_path_unsafe:${JSON.stringify(rawEntry)}`);
    }
  }
  for (const line of verboseListing.split(/\r?\n/).filter(Boolean)) {
    if (/^[lh]/.test(line.trimStart())) throw new Error("archive_link_entry_forbidden");
  }
}

export async function verifyExtractedArchiveTree(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  let entries = 0;
  let bytes = 0;
  async function visit(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      entries += 1;
      if (entries > MAX_ARCHIVE_ENTRIES) throw new Error("archive_entry_count_invalid");
      const candidate = path.resolve(current, entry.name);
      const relative = path.relative(resolvedRoot, candidate);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("archive_extraction_boundary_escaped");
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error("archive_link_entry_forbidden");
      if (stat.isDirectory()) await visit(candidate);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > MAX_EXTRACTED_BYTES) throw new Error("archive_extracted_size_exceeded");
      } else {
        throw new Error("archive_special_entry_forbidden");
      }
    }
  }
  await visit(resolvedRoot);
}
