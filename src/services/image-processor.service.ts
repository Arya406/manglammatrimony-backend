/**
 * Manglam Matrimony — Production Image Processing Pipeline
 *
 * Handles real-world image inputs:
 * - JPEG, PNG, WebP, HEIC, HEIF, GIF
 * - Magic byte inspection (never trusts extension or client MIME alone)
 * - Decompression bomb protection (limits max decoded pixels)
 * - EXIF orientation normalization (phone photos never appear rotated)
 * - Metadata stripping (GPS, camera serials stripped for user privacy)
 * - Color profile safety (normalized to sRGB)
 * - Proportional canonical 4:5 profile derivative (preserves subject, face/upper bias)
 * - Platform canonical WebP output encoding with JPEG fallback
 */

import sharp, { Metadata } from "sharp";
import heicConvert from "heic-convert";
import { config } from "../config/env";

export interface ProcessedImageResult {
  buffer: Buffer;
  mimeType: "image/webp" | "image/jpeg";
  width: number;
  height: number;
  fileSize: number;
  originalFormat: string;
}

export class ImageProcessingError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 400) {
    super(message);
    this.name = "ImageProcessingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Detects actual image format by inspecting file signatures (magic bytes).
 */
export function detectImageSignature(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // 3. WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return "webp";
  }

  // 4. GIF: GIF87a or GIF89a
  if (
    buffer[0] === 0x47 && // G
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x38 // 8
  ) {
    return "gif";
  }

  // 5. HEIC / HEIF / AVIF: ftyp box at offset 4
  if (
    buffer[4] === 0x66 && // f
    buffer[5] === 0x74 && // t
    buffer[6] === 0x79 && // y
    buffer[7] === 0x70 // p
  ) {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (
      brand.includes("heic") ||
      brand.includes("heix") ||
      brand.includes("hevc") ||
      brand.includes("heim") ||
      brand.includes("heis") ||
      brand.includes("mif1") ||
      brand.includes("msf1")
    ) {
      return "heic";
    }
  }

  return null;
}

export class ImageProcessorService {
  /**
   * Processes, normalizes, and generates a platform-canonical profile image derivative.
   */
  async processProfileImage(
    rawBuffer: Buffer,
    _originalFileName?: string
  ): Promise<ProcessedImageResult> {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new ImageProcessingError(
        "No image file content provided.",
        "INVALID_IMAGE"
      );
    }

    // 1. File size pre-check
    const maxSizeBytes = config.photo.maxSizeMb * 1024 * 1024;
    if (rawBuffer.length > maxSizeBytes) {
      throw new ImageProcessingError(
        `Photo size exceeds maximum allowed limit of ${config.photo.maxSizeMb} MB.`,
        "IMAGE_TOO_LARGE"
      );
    }

    // 2. Validate image signature (Magic bytes)
    const detectedFormat = detectImageSignature(rawBuffer);
    if (!detectedFormat) {
      throw new ImageProcessingError(
        "The uploaded file is not a valid image or is corrupted. Please choose a JPG, PNG, WebP, or HEIC photo.",
        "INVALID_IMAGE"
      );
    }

    let inputBuffer = rawBuffer;

    // 3. Handle Apple HEIC/HEIF images
    if (detectedFormat === "heic") {
      try {
        // First test if sharp can decode it natively
        await sharp(rawBuffer).metadata();
      } catch {
        // Fallback to heic-convert WASM decoder
        try {
          const convertedBuffer = await heicConvert({
            buffer: rawBuffer,
            format: "JPEG",
            quality: 0.95,
          });
          inputBuffer = Buffer.from(convertedBuffer);
        } catch (heicErr: any) {
          console.error("[HEIC DECODE ERROR]:", heicErr);
          throw new ImageProcessingError(
            "Could not decode HEIC image. Please upload a standard JPEG or PNG photo.",
            "IMAGE_PROCESSING_FAILED"
          );
        }
      }
    }

    // 4. Safe image decoding & decompression bomb prevention
    let metadata: Metadata;
    try {
      metadata = await sharp(inputBuffer, {
        limitInputPixels: config.photo.maxPixels,
      }).metadata();
    } catch (err: any) {
      if (err.message && err.message.includes("pixel limit")) {
        throw new ImageProcessingError(
          "Image dimensions are too large. Please upload an image with lower resolution.",
          "IMAGE_DIMENSIONS_TOO_LARGE"
        );
      }
      throw new ImageProcessingError(
        "The uploaded image could not be decoded. File may be corrupted.",
        "INVALID_IMAGE"
      );
    }

    const srcWidth = metadata.width || 0;
    const srcHeight = metadata.height || 0;

    if (srcWidth < config.photo.minWidth || srcHeight < config.photo.minHeight) {
      throw new ImageProcessingError(
        `Image dimensions must be at least ${config.photo.minWidth}x${config.photo.minHeight} pixels.`,
        "IMAGE_TOO_SMALL"
      );
    }

    if (srcWidth * srcHeight > config.photo.maxPixels) {
      throw new ImageProcessingError(
        "Image total pixel count exceeds the safety limit.",
        "IMAGE_DIMENSIONS_TOO_LARGE"
      );
    }

    // 5. Image Transformation Pipeline:
    // - .rotate(): normalizes EXIF orientation automatically
    // - .toColourspace('srgb'): ensures accurate color profile
    // - .resize(): generates canonical 4:5 derivative (preserving subject, face/upper bias)
    // - Metadata stripped automatically (sharp does not include EXIF/GPS by default)
    const targetWidth = config.photo.outputWidth;
    const targetHeight = config.photo.outputHeight;

    let sharpPipeline = sharp(inputBuffer, {
      limitInputPixels: config.photo.maxPixels,
    })
      .rotate() // Auto-orient based on EXIF
      .toColourspace("srgb") // Normalize colors
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "cover",
        position: "attention", // Biases towards face/subject attention without extreme crop
        withoutEnlargement: true, // Don't artificially upscale smaller high-quality photos
      });

    // 6. Encode to Platform Canonical WebP with fallback
    let outputBuffer: Buffer;
    let mimeType: "image/webp" | "image/jpeg" = "image/webp";

    try {
      outputBuffer = await sharpPipeline
        .webp({
          quality: config.photo.quality,
          effort: 4,
        })
        .toBuffer();
    } catch (webpErr) {
      console.warn("[WEBP ENCODE FALLBACK TO JPEG]:", webpErr);
      // Fallback to high-quality JPEG
      try {
        outputBuffer = await sharp(inputBuffer, {
          limitInputPixels: config.photo.maxPixels,
        })
          .rotate()
          .toColourspace("srgb")
          .resize({
            width: targetWidth,
            height: targetHeight,
            fit: sharp.fit.cover,
            position: sharp.strategy.attention,
            withoutEnlargement: true,
          })
          .jpeg({
            quality: config.photo.quality,
            mozjpeg: true,
          })
          .toBuffer();
        mimeType = "image/jpeg";
      } catch (jpegErr) {
        console.error("[IMAGE ENCODE FATAL ERROR]:", jpegErr);
        throw new ImageProcessingError(
          "We could not process this image format. Please try another photo.",
          "IMAGE_PROCESSING_FAILED"
        );
      }
    }

    // Read final output dimensions
    const finalMeta = await sharp(outputBuffer).metadata();

    return {
      buffer: outputBuffer,
      mimeType,
      width: finalMeta.width || targetWidth,
      height: finalMeta.height || targetHeight,
      fileSize: outputBuffer.length,
      originalFormat: detectedFormat,
    };
  }
}

export const imageProcessorService = new ImageProcessorService();
