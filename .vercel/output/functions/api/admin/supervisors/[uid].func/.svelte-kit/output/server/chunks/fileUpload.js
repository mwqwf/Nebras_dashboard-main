import "firebase/storage";
import "firebase/firestore";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/auth";
import "browser-image-compression";
function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
function mimeToContentType(mime) {
  if (!mime) return "document";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
export {
  formatFileSize as f,
  mimeToContentType as m
};
