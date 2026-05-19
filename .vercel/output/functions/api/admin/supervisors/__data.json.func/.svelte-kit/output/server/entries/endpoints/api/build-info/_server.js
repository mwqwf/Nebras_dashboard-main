import { json } from "@sveltejs/kit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { i as isAdminConfigured, g as getNebrasAdminApp } from "../../../../chunks/firebaseAdmin.js";
async function GET() {
  let version = null;
  try {
    const p = join(process.cwd(), ".vercel", "output", "static", "_app", "version.json");
    version = JSON.parse(readFileSync(p, "utf8"))?.version ?? null;
  } catch {
  }
  let storageBucket = null;
  let projectId = null;
  if (isAdminConfigured()) {
    try {
      const app = getNebrasAdminApp();
      projectId = app.options?.projectId || null;
      storageBucket = app.options?.storageBucket || null;
    } catch {
    }
  }
  return json({
    ok: true,
    deployedAt: (/* @__PURE__ */ new Date()).toISOString(),
    version,
    features: {
      internetArchiveAdminPage: true,
      internetArchiveCronTick: true,
      internetArchiveEngineApi: true
    },
    firebase: {
      adminConfigured: isAdminConfigured(),
      projectId,
      storageBucket
    }
  });
}
export {
  GET
};
