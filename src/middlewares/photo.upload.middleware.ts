import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { config } from "../config/env";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.photo.maxSizeMb * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, _file, cb) => {
    // Permissive multipart acceptance: actual image signature validation occurs on the buffer
    cb(null, true);
  },
}).single("photo");

export function handlePhotoUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  upload(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          success: false,
          code: "FILE_TOO_LARGE",
          message: `Photo size exceeds maximum allowed limit of ${config.photo.maxSizeMb} MB.`,
        });
        return;
      }
      res.status(400).json({
        success: false,
        code: "INVALID_FILE",
        message: err.message,
      });
      return;
    } else if (err) {
      res.status(400).json({
        success: false,
        code: "INVALID_FILE",
        message: "Failed to process photo upload.",
      });
      return;
    }
    next();
  });
}
