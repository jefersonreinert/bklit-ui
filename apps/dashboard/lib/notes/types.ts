/** Knowledge notes: markdown text with [[links]], #tags and embedded files. */

export interface Note {
  id: string;
  title: string;
  /** Folder path like "Restaurante/Fornecedores" ("" = root). */
  folder: string;
  /** Markdown. Attachments are referenced as att:<id>. */
  content: string;
  pinned: boolean;
  /** Emoji, or att:<id> for an uploaded image. */
  icon?: string;
  /** att:<id> for an uploaded image, or grad:<n> for a preset gradient. */
  cover?: string;
  /** Page this one lives inside (sub-page), like Notion. */
  parentId?: string | null;
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
