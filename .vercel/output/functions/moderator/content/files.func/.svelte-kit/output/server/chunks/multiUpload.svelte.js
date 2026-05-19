import "clsx";
import "firebase/storage";
import "firebase/firestore";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/auth";
import "browser-image-compression";
let uploadProgressRaw = {};
const DEFAULT_CONCURRENCY = 3;
function getItemProgress(id) {
  const raw = uploadProgressRaw[id];
  if (raw != null) return raw;
  return multiState.queue.find((q) => q.id === id)?.progress ?? 0;
}
let multiState = {
  queue: [],
  youtubeQueue: [],
  isUploading: false,
  isPaused: false,
  currentId: null,
  lastError: "",
  allDoneAt: 0,
  batchId: null,
  concurrency: DEFAULT_CONCURRENCY,
  lastSections: { main_section: "", subsection: "", secondary_subsection: "" }
};
function getMultiUploadState() {
  return multiState;
}
function setConcurrency(n) {
  const v = Math.max(1, Math.min(5, Number(n) || DEFAULT_CONCURRENCY));
  multiState.concurrency = v;
}
export {
  DEFAULT_CONCURRENCY as D,
  getMultiUploadState as a,
  getItemProgress as g,
  setConcurrency as s
};
