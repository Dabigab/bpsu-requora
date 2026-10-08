/* ============================================================
   ReQuora — uploaded image helpers (no dependencies)
   - detectImageType(): identifies a file by its first bytes, so a
     renamed .exe or .html cannot pass as a photo.
   - removeUpload(): deletes a stored photo safely (stays inside /uploads).
   ============================================================ */

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Returns 'jpg' | 'png' | 'gif' | 'webp' | null from the file's first bytes.
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  const head6 = buf.toString('latin1', 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Reads just the first bytes of a stored file and detects its type.
function detectImageTypeOfFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    return detectImageType(buf.subarray(0, read));
  } catch (err) {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        /* ignore */
      }
    }
  }
}

// Deletes a stored photo given its public URL ("/uploads/<name>").
// Only plain file names inside the uploads folder are ever touched.
function removeUpload(imageUrl, uploadDir = UPLOAD_DIR) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/uploads/')) return false;
  const name = imageUrl.slice('/uploads/'.length);
  if (!name || name !== path.basename(name) || name === '.gitkeep') return false;
  try {
    fs.unlinkSync(path.join(uploadDir, name));
    return true;
  } catch (err) {
    return false; // already gone
  }
}

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    /* already gone */
  }
}

module.exports = { UPLOAD_DIR, detectImageType, detectImageTypeOfFile, removeUpload, removeFileIfExists };
