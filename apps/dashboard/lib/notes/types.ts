/** Knowledge notes: markdown text with [[links]], #tags and embedded files. */

export interface Note {
  id: string;
  title: string;
  /** Folder path like "Restaurante/Fornecedores" ("" = root). */
  folder: string;
  /** Markdown. Attachments are referenced as att:<id>. */
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NoteFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export type NoteFileMeta = Omit<NoteFile, "blob">;
