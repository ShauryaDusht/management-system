/**
 * Campus Sanchalika - IIT Gandhinagar
 * GeoTracker Client-Side Image Compression Service
 * Resizes camera images to max 1600px, 0.82 JPEG quality, handles EXIF orientation.
 */
(function(window) {
  'use strict';

  var DEFAULT_CONFIG = {
    maxDimension: 1600,   // max width or height in pixels
    quality: 0.82,        // target JPEG quality
    mimeType: 'image/jpeg',
    minSizeToCompressBytes: 150 * 1024 // don't compress if already under 150 KB
  };

  /**
   * Helper to format bytes into readable string (e.g. "8.2 MB", "620 KB")
   */
  function formatBytes(bytes, decimals) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var dm = decimals < 0 ? 0 : (decimals || 1);
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Calculate output dimensions preserving aspect ratio without upscaling.
   */
  function calculateDimensions(srcWidth, srcHeight, maxDimension) {
    if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
      return { width: srcWidth, height: srcHeight, scaled: false };
    }
    var ratio = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
    return {
      width: Math.max(1, Math.round(srcWidth * ratio)),
      height: Math.max(1, Math.round(srcHeight * ratio)),
      scaled: true
    };
  }

  /**
   * Read EXIF orientation tag from ArrayBuffer if present.
   * Returns orientation number 1-8, or 1 if not found.
   */
  function getExifOrientation(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 4) return 1;
    var view = new DataView(arrayBuffer);
    if (view.getUint16(0, false) !== 0xFFD8) {
      return 1; // Not JPEG
    }
    var length = view.byteLength;
    var offset = 2;
    while (offset < length) {
      if (offset + 4 > length) break;
      var marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xFFE1) {
        // APP1 marker
        var app1Length = view.getUint16(offset, false);
        offset += 2;
        if (offset + 4 <= length && view.getUint32(offset, false) === 0x45786966) { // "Exif"
          offset += 6; // skip "Exif\0\0"
          if (offset + 8 > length) break;
          var isLittleEndian = view.getUint16(offset, false) === 0x4949;
          var firstIfdOffset = view.getUint32(offset + 4, isLittleEndian);
          offset += firstIfdOffset;
          if (offset + 2 <= length) {
            var tags = view.getUint16(offset, isLittleEndian);
            offset += 2;
            for (var i = 0; i < tags; i++) {
              if (offset + 12 > length) break;
              if (view.getUint16(offset, isLittleEndian) === 0x0112) { // Orientation tag
                return view.getUint16(offset + 8, isLittleEndian);
              }
              offset += 12;
            }
          }
        }
        break;
      } else if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA || marker === 0xFFD9) {
        break;
      } else {
        if (offset + 2 > length) break;
        offset += view.getUint16(offset, false);
      }
    }
    return 1;
  }

  /**
   * Main image compression function.
   * Takes a File or Blob, compresses it to JPEG max 1600px, 0.82 quality.
   */
  function compressImage(fileOrBlob, userOptions) {
    var options = Object.assign({}, DEFAULT_CONFIG, userOptions || {});
    var originalSize = fileOrBlob.size || 0;

    return new Promise(function(resolve, reject) {
      if (!fileOrBlob || typeof fileOrBlob.slice !== 'function') {
        reject(new Error('Invalid file or blob provided for image compression.'));
        return;
      }

      var type = fileOrBlob.type || '';
      if (type && !type.startsWith('image/')) {
        reject(new Error('File is not an image (type: ' + type + ').'));
        return;
      }

      var reader = new FileReader();
      reader.onload = function(e) {
        var buffer = e.target.result;
        var orientation = getExifOrientation(buffer);

        var blobUrl = URL.createObjectURL(fileOrBlob);
        var img = new Image();

        img.onload = function() {
          URL.revokeObjectURL(blobUrl);

          var naturalWidth = img.naturalWidth || img.width;
          var naturalHeight = img.naturalHeight || img.height;

          if (!naturalWidth || !naturalHeight) {
            resolve({
              blob: fileOrBlob,
              originalSize: originalSize,
              compressedSize: originalSize,
              width: 0,
              height: 0,
              reductionPercent: 0,
              mimeType: fileOrBlob.type || 'image/jpeg',
              compressed: false,
              note: 'Could not read image dimensions'
            });
            return;
          }

          var isRotated90 = (orientation === 6 || orientation === 8 || orientation === 5 || orientation === 7);
          var activeWidth = isRotated90 ? naturalHeight : naturalWidth;
          var activeHeight = isRotated90 ? naturalWidth : naturalHeight;

          var dims = calculateDimensions(activeWidth, activeHeight, options.maxDimension);

          if (originalSize <= options.minSizeToCompressBytes && !dims.scaled && orientation === 1) {
            resolve({
              blob: fileOrBlob,
              originalSize: originalSize,
              compressedSize: originalSize,
              width: naturalWidth,
              height: naturalHeight,
              reductionPercent: 0,
              mimeType: fileOrBlob.type || 'image/jpeg',
              compressed: false
            });
            return;
          }

          var canvas = document.createElement('canvas');
          canvas.width = dims.width;
          canvas.height = dims.height;
          var ctx = canvas.getContext('2d');

          // Apply EXIF transform
          switch (orientation) {
            case 2:
              ctx.translate(dims.width, 0);
              ctx.scale(-1, 1);
              break;
            case 3:
              ctx.translate(dims.width, dims.height);
              ctx.rotate(Math.PI);
              break;
            case 4:
              ctx.translate(0, dims.height);
              ctx.scale(1, -1);
              break;
            case 5:
              canvas.width = dims.height;
              canvas.height = dims.width;
              ctx.rotate(0.5 * Math.PI);
              ctx.scale(1, -1);
              break;
            case 6:
              ctx.translate(dims.width, 0);
              ctx.rotate(0.5 * Math.PI);
              break;
            case 7:
              canvas.width = dims.height;
              canvas.height = dims.width;
              ctx.rotate(0.5 * Math.PI);
              ctx.translate(dims.width, -dims.height);
              ctx.scale(-1, 1);
              break;
            case 8:
              ctx.translate(0, dims.height);
              ctx.rotate(-0.5 * Math.PI);
              break;
            default:
              break;
          }

          var drawW = isRotated90 ? dims.height : dims.width;
          var drawH = isRotated90 ? dims.width : dims.height;
          ctx.drawImage(img, 0, 0, drawW, drawH);

          canvas.toBlob(function(compressedBlob) {
            canvas.width = 0;
            canvas.height = 0;

            if (!compressedBlob) {
              resolve({
                blob: fileOrBlob,
                originalSize: originalSize,
                compressedSize: originalSize,
                width: naturalWidth,
                height: naturalHeight,
                reductionPercent: 0,
                mimeType: fileOrBlob.type || 'image/jpeg',
                compressed: false,
                note: 'canvas.toBlob returned null'
              });
              return;
            }

            var compressedSize = compressedBlob.size;
            var reduction = originalSize > 0
              ? Math.max(0, ((originalSize - compressedSize) / originalSize) * 100)
              : 0;

            resolve({
              blob: compressedBlob,
              originalSize: originalSize,
              compressedSize: compressedSize,
              width: dims.width,
              height: dims.height,
              reductionPercent: parseFloat(reduction.toFixed(1)),
              mimeType: compressedBlob.type || options.mimeType,
              compressed: true
            });
          }, options.mimeType, options.quality);
        };

        img.onerror = function() {
          URL.revokeObjectURL(blobUrl);
          console.warn('[ImageCompressor] Image loading failed, retaining original.');
          resolve({
            blob: fileOrBlob,
            originalSize: originalSize,
            compressedSize: originalSize,
            width: 0,
            height: 0,
            reductionPercent: 0,
            mimeType: fileOrBlob.type || 'image/jpeg',
            compressed: false,
            note: 'Image decode error'
          });
        };

        img.src = blobUrl;
      };

      reader.onerror = function() {
        console.warn('[ImageCompressor] FileReader failed, retaining original.');
        resolve({
          blob: fileOrBlob,
          originalSize: originalSize,
          compressedSize: originalSize,
          width: 0,
          height: 0,
          reductionPercent: 0,
          mimeType: fileOrBlob.type || 'image/jpeg',
          compressed: false,
          note: 'FileReader error'
        });
      };

      reader.readAsArrayBuffer(fileOrBlob.slice(0, 64 * 1024));
    });
  }

  window.GeoTrackerImageCompressor = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    formatBytes: formatBytes,
    calculateDimensions: calculateDimensions,
    getExifOrientation: getExifOrientation,
    compressImage: compressImage
  };

})(window);

