import fs from "node:fs/promises";
import path from "node:path";
import {
  deleteFile,
  downloadFile,
  fileExists,
  uploadFile,
} from "@huggingface/hub";

/**
 * whatsapp-web.js RemoteAuth store backed by a private Hugging Face dataset,
 * so the WhatsApp session survives Space restarts (free Spaces have no
 * persistent disk). RemoteAuth zips the session to `<dataPath>/<session>.zip`
 * before calling save() (it only passes the session name).
 */
export class HfStore {
  constructor({ repo, accessToken, dataPath = "./.wwebjs_auth" }) {
    this.repo = { type: "dataset", name: repo };
    this.accessToken = accessToken;
    this.dataPath = path.resolve(dataPath);
  }

  path(session) {
    return `${session}.zip`;
  }

  async sessionExists({ session }) {
    return await fileExists({
      repo: this.repo,
      path: this.path(session),
      accessToken: this.accessToken,
    });
  }

  async save({ session }) {
    const content = await fs.readFile(
      path.join(this.dataPath, this.path(session))
    );
    await uploadFile({
      repo: this.repo,
      accessToken: this.accessToken,
      file: { path: this.path(session), content: new Blob([content]) },
      commitTitle: "Update WhatsApp session",
    });
    console.log(`Session saved (${Math.round(content.length / 1024)} KB)`);
  }

  async extract({ session, path }) {
    const blob = await downloadFile({
      repo: this.repo,
      path: this.path(session),
      accessToken: this.accessToken,
    });
    if (blob) {
      await fs.writeFile(path, Buffer.from(await blob.arrayBuffer()));
    }
  }

  async delete({ session }) {
    try {
      await deleteFile({
        repo: this.repo,
        path: this.path(session),
        accessToken: this.accessToken,
      });
    } catch {
      // already gone
    }
  }
}
