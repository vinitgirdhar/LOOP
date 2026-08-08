import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { ALLOWED_UPLOAD_MIME } from '@loop/shared';
import { env, features } from '../env.js';
import { badRequest } from './http.js';
import { logger } from './logger.js';

if (features.cloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

export interface StoredFile {
  url: string;
  publicId: string | null;
  name: string;
  mime: string;
  size: number;
}

/** Defence in depth: multer already filters, we validate again before storing. */
export function assertUploadAllowed(file: { mimetype: string; size: number; originalname: string }) {
  if (!ALLOWED_UPLOAD_MIME.includes(file.mimetype)) {
    throw badRequest(`File type ${file.mimetype} is not allowed`);
  }
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) throw badRequest(`File is larger than ${env.MAX_UPLOAD_MB}MB`);
  if (/[\\/]|\.\./.test(file.originalname)) throw badRequest('Invalid file name');
}

export async function storeFile(
  file: Express.Multer.File,
  folder: string,
): Promise<StoredFile> {
  assertUploadAllowed(file);
  const safeName = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120);

  if (features.cloudinary) {
    const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `loop/${folder}`, resource_type: 'auto', use_filename: true, unique_filename: true },
        (error, result) => (error || !result ? reject(error ?? new Error('upload failed')) : resolve(result as never)),
      );
      stream.end(file.buffer);
    });
    return {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      name: safeName,
      mime: file.mimetype,
      size: file.size,
    };
  }

  // ponytail: local disk fallback so the app runs with zero Cloudinary setup.
  const dir = path.join(LOCAL_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}-${safeName}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return {
    url: `${env.API_URL}/uploads/${folder}/${filename}`,
    publicId: null,
    name: safeName,
    mime: file.mimetype,
    size: file.size,
  };
}

export async function deleteFile(publicId: string | null, url: string) {
  try {
    if (publicId && features.cloudinary) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
      return;
    }
    const marker = '/uploads/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const rel = url.slice(idx + marker.length);
    if (rel.includes('..')) return;
    await fs.rm(path.join(LOCAL_DIR, rel), { force: true });
  } catch (error: unknown) {
    logger.warn('file delete failed', error instanceof Error ? error.message : error);
  }
}

export const localUploadDir = LOCAL_DIR;
