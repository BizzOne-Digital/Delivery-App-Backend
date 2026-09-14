import fs from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env.js";

export interface StoredFile {
  url: string;
  key: string;
  contentType: string;
  size: number;
  checksum: string;
}

export interface StorageAdapter {
  save(file: Express.Multer.File, folder: string): Promise<StoredFile>;
}

class LocalDiskStorage implements StorageAdapter {
  private baseDir = path.resolve("uploads");

  async save(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    const dir = path.join(this.baseDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname) || ".bin";
    const key = `${crypto.randomUUID()}${ext}`;
    const dest = path.join(dir, key);
    fs.writeFileSync(dest, file.buffer);
    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
    return {
      key,
      url: `${env.UPLOAD_BASE_URL}/uploads/${folder}/${key}`,
      contentType: file.mimetype,
      size: file.size,
      checksum,
    };
  }
}

export const storage: StorageAdapter = new LocalDiskStorage();
