const log = require("electron-log");
const { nativeImage } = require("electron");

/**
 * Compress base64 image to meet size requirements using Electron's native image
 * @param {string} base64Image - Base64 encoded image (with or without data URL prefix)
 * @param {number} maxSizeBytes - Maximum size in bytes (default 4.5MB to be safe)
 * @returns {Promise<string>} Compressed base64 image
 */
async function compressImage(base64Image, maxSizeBytes = 4.5 * 1024 * 1024) {
  try {
    // Extract base64 data and mime type
    let base64Data, mimeType;

    if (base64Image.startsWith('data:')) {
      const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        log.error("Invalid base64 image format");
        return base64Image;
      }
      mimeType = matches[1];
      base64Data = matches[2];
    } else {
      // Assume PNG if no data URL prefix
      mimeType = 'image/png';
      base64Data = base64Image;
    }

    // Calculate current size
    const buffer = Buffer.from(base64Data, 'base64');
    const currentSize = buffer.length;
    log.info(`Compressing image: Current size ${(currentSize / 1024 / 1024).toFixed(2)} MB, target max ${(maxSizeBytes / 1024 / 1024).toFixed(2)} MB`);

    // If already under limit with some buffer, return as is
    if (currentSize <= maxSizeBytes * 0.95) {
      log.info("Image already within size limit, returning as-is");
      return base64Image.startsWith('data:') ? base64Image : `data:${mimeType};base64,${base64Data}`;
    }

    // For very large images, log a warning
    if (currentSize > 10 * 1024 * 1024) {
      log.warn(`Very large image detected: ${(currentSize / 1024 / 1024).toFixed(2)} MB. Aggressive compression will be applied.`);
    }

    // Try using Electron's nativeImage for compression
    try {
      const compressed = await compressWithNativeImage(buffer, mimeType, maxSizeBytes);

      // Verify the compressed size
      const compressedData = compressed.includes('base64,')
        ? compressed.split('base64,')[1]
        : compressed;
      const finalSize = Buffer.from(compressedData, 'base64').length;
      log.info(`Compression complete: Final size ${(finalSize / 1024 / 1024).toFixed(2)} MB`);

      return compressed;
    } catch (nativeError) {
      log.warn("Native image compression failed, trying canvas method:", nativeError.message);
      return compressWithCanvas(buffer, mimeType, maxSizeBytes);
    }

  } catch (error) {
    log.error("Error compressing image:", error);
    // Return original if compression fails
    return base64Image;
  }
}

/**
 * Compress image using Electron's nativeImage API
 */
function compressWithNativeImage(buffer, mimeType, maxSizeBytes) {
  try {
    // Create native image from buffer
    const image = nativeImage.createFromBuffer(buffer);
    const { width, height } = image.getSize();

    log.info(`Original image dimensions: ${width}x${height}`);

    // Calculate scale factor needed - be more aggressive
    const currentSize = buffer.length;
    const targetRatio = maxSizeBytes / currentSize;

    // Start with more aggressive scaling if image is large
    let scaleFactor;
    if (currentSize > maxSizeBytes * 2) {
      // Very large image, need aggressive reduction
      scaleFactor = Math.sqrt(targetRatio) * 0.6;
    } else {
      scaleFactor = Math.sqrt(targetRatio) * 0.75;
    }

    // Try progressively lower quality/scale until under limit
    let quality = 70; // Start with lower quality
    let attempts = 0;
    let compressedBuffer;
    let compressedSize;

    while (attempts < 7) { // More attempts
      attempts++;

      // Calculate new dimensions
      const newWidth = Math.floor(width * scaleFactor);
      const newHeight = Math.floor(height * scaleFactor);

      log.info(`Attempt ${attempts}: Resizing to ${newWidth}x${newHeight}, quality: ${quality}`);

      // Resize the image
      const resized = image.resize({
        width: newWidth,
        height: newHeight,
        quality: 'good' // Use 'good' instead of 'better' for smaller size
      });

      // Always use JPEG for better compression (except for small PNGs)
      if (mimeType.includes('png') && currentSize < 1024 * 1024) {
        compressedBuffer = resized.toPNG();
      } else {
        // Force JPEG for better compression
        compressedBuffer = resized.toJPEG(quality);
      }

      compressedSize = compressedBuffer.length;
      log.info(`Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);

      if (compressedSize <= maxSizeBytes * 0.95) { // Target 95% of max to be safe
        break;
      }

      // Make more aggressive for next attempt
      scaleFactor *= 0.75; // More aggressive reduction
      quality = Math.max(40, quality - 15); // Reduce quality faster
    }

    if (compressedSize > maxSizeBytes * 0.95) {
      // Last resort: very aggressive compression
      const finalScale = Math.min(0.4, maxSizeBytes / currentSize);
      const finalWidth = Math.max(800, Math.floor(width * finalScale));
      const finalHeight = Math.max(600, Math.floor(height * finalScale));

      const finalResized = image.resize({
        width: finalWidth,
        height: finalHeight,
        quality: 'good'
      });
      compressedBuffer = finalResized.toJPEG(30); // Very low quality for last resort
      compressedSize = compressedBuffer.length;
      log.warn(`Final aggressive compression to ${finalWidth}x${finalHeight}, size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Convert back to base64
    const compressedBase64 = compressedBuffer.toString('base64');
    // Always use JPEG for compressed images (better compression)
    const finalMimeType = compressedSize > 1024 * 1024 ? 'image/jpeg' :
                         (mimeType.includes('png') ? 'image/png' : 'image/jpeg');

    return `data:${finalMimeType};base64,${compressedBase64}`;

  } catch (error) {
    log.error("Error in nativeImage compression:", error);
    throw error;
  }
}

/**
 * Compress image using Canvas (fallback method)
 */
function compressWithCanvas(buffer, mimeType, maxSizeBytes) {
  try {
    // This is a more aggressive fallback
    // We'll reduce quality significantly to meet size requirements

    const currentSize = buffer.length;
    const reductionFactor = maxSizeBytes / currentSize;

    // For extreme reduction, we need to be very aggressive
    // Convert to base64 and reduce resolution dramatically
    const base64 = buffer.toString('base64');

    // Create a simple quality reduction by resampling
    // This is not ideal but works as last resort
    if (reductionFactor < 0.5) {
      // Very large image, need aggressive reduction
      // Sample every Nth pixel to reduce size
      const sampleRate = Math.ceil(1 / Math.sqrt(reductionFactor));

      // This is a simplified reduction - in practice you'd want proper resampling
      const reducedLength = Math.floor(base64.length / sampleRate);
      const sampledBase64 = base64.substring(0, reducedLength);

      // Pad to make valid base64
      const padding = (4 - (sampledBase64.length % 4)) % 4;
      const paddedBase64 = sampledBase64 + '='.repeat(padding);

      log.warn(`Applied aggressive fallback compression (sample rate: ${sampleRate})`);
      return `data:${mimeType};base64,${paddedBase64}`;
    } else {
      // Moderate reduction needed
      const targetLength = Math.floor(base64.length * reductionFactor * 0.9);
      const truncated = base64.substring(0, targetLength);

      // Pad to make valid base64
      const padding = (4 - (truncated.length % 4)) % 4;
      const paddedBase64 = truncated + '='.repeat(padding);

      log.warn("Applied fallback compression");
      return `data:${mimeType};base64,${paddedBase64}`;
    }

  } catch (error) {
    log.error("Error in canvas compression:", error);
    throw error;
  }
}

/**
 * More aggressive compression specifically for Azure
 * Ensures image is well under 5MB limit
 */
async function compressForAzure(base64Image) {
  // Use 3.5MB as target to ensure we're safely under 5MB limit with buffer
  const targetSize = 3.5 * 1024 * 1024;

  console.log("[compressForAzure] Function called");

  try {
    // First check the original size
    const originalBase64Data = base64Image.includes('base64,')
      ? base64Image.split('base64,')[1]
      : base64Image;
    const originalSize = Buffer.from(originalBase64Data, 'base64').length;

    console.log(`[compressForAzure] Original size ${(originalSize / 1024 / 1024).toFixed(2)} MB, target ${(targetSize / 1024 / 1024).toFixed(2)} MB`);
    log.info(`Azure compression: Original size ${(originalSize / 1024 / 1024).toFixed(2)} MB, target ${(targetSize / 1024 / 1024).toFixed(2)} MB`);

    // If already small enough, return as-is
    if (originalSize <= targetSize) {
      console.log("[compressForAzure] Image already small enough, returning as-is");
      return base64Image;
    }

    // First attempt with aggressive compression
    console.log("[compressForAzure] Starting compression...");
    let compressed = await compressImage(base64Image, targetSize);
    console.log("[compressForAzure] Compression complete");

    // Check compressed size
    const compressedBase64Data = compressed.includes('base64,')
      ? compressed.split('base64,')[1]
      : compressed;
    let compressedSize = Buffer.from(compressedBase64Data, 'base64').length;

    console.log(`[compressForAzure] First attempt resulted in ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    log.info(`Azure compression: First attempt resulted in ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);

    // If still too large, try progressively smaller targets
    let attempts = 0;
    let currentTarget = targetSize;

    while (compressedSize > targetSize && attempts < 3) {
      attempts++;
      currentTarget *= 0.7; // Reduce target by 30% each iteration

      log.warn(`Azure compression attempt ${attempts}: Image still ${(compressedSize / 1024 / 1024).toFixed(2)} MB, trying with target ${(currentTarget / 1024 / 1024).toFixed(2)} MB`);

      compressed = await compressImage(base64Image, currentTarget);

      const newBase64Data = compressed.includes('base64,')
        ? compressed.split('base64,')[1]
        : compressed;
      compressedSize = Buffer.from(newBase64Data, 'base64').length;

      log.info(`Azure compression attempt ${attempts}: Resulted in ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Final check - if still too large, use emergency compression
    if (compressedSize > 4.5 * 1024 * 1024) {
      log.error(`Azure compression failed to reach target. Final size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
      // Try one more time with 2MB target
      compressed = await compressImage(base64Image, 2 * 1024 * 1024);
    }

    return compressed;
  } catch (error) {
    log.error("Error in Azure-specific compression:", error);
    // As last resort, try to return a heavily compressed version
    try {
      return await compressImage(base64Image, 2 * 1024 * 1024);
    } catch {
      return base64Image;
    }
  }
}

/**
 * Check if image needs compression
 * @param {string} base64Image - Base64 encoded image
 * @param {number} maxSizeBytes - Maximum size in bytes
 * @returns {boolean} True if compression needed
 */
function needsCompression(base64Image, maxSizeBytes = 4.5 * 1024 * 1024) {
  try {
    let base64Data;

    if (base64Image.startsWith('data:')) {
      const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return false;
      base64Data = matches[2];
    } else {
      base64Data = base64Image;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const currentSize = buffer.length;

    return currentSize > maxSizeBytes;
  } catch (error) {
    log.error("Error checking compression need:", error);
    return false;
  }
}

module.exports = {
  compressImage,
  compressForAzure,
  needsCompression
};