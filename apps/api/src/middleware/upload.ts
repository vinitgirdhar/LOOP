import multer from 'multer';
import { ALLOWED_UPLOAD_MIME } from '@loop/shared';
import { env } from '../env.js';
import { badRequest } from '../lib/http.js';

/** Files are held in memory then streamed to Cloudinary (or local disk). */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME.includes(file.mimetype)) {
      cb(badRequest(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

export const imageOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(badRequest('Only image files are allowed here'));
      return;
    }
    cb(null, true);
  },
});
