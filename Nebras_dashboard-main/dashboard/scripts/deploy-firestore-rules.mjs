#!/usr/bin/env node
/**
 * Deploy firestore.rules using firebase-admin's Security Rules API.
 * Bypasses firebase-tools' serviceusage.services.get precheck — which the
 * standard Nebras service account is not authorized for. The SA still needs
 * the `roles/firebaserules.admin` permission (or equivalent) to publish.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *     node scripts/deploy-firestore-rules.mjs [--file ../firestore.rules]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const rulesPath = resolve(
    __dirname,
    parseArg('--file', '../firestore.rules')
  );
  const source = readFileSync(rulesPath, 'utf8');
  if (!source.trim()) throw new Error(`empty rules file at ${rulesPath}`);

  const saPathFromEnv =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.NEBRAS_SERVICE_ACCOUNT_PATH ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  let credential;
  let projectId;
  if (saPathFromEnv) {
    const sa = JSON.parse(readFileSync(saPathFromEnv, 'utf8'));
    credential = cert(sa);
    projectId = sa.project_id;
  } else {
    credential = applicationDefault();
  }

  const app = initializeApp({ credential, projectId });
  const rules = getSecurityRules(app);

  console.log(`[deploy] project=${projectId || '(default)'} file=${rulesPath}`);
  console.log(`[deploy] source length = ${source.length} bytes`);

  // Single call: creates a ruleset + releases it as cloud.firestore.
  const ruleset = await rules.releaseFirestoreRulesetFromSource(source);
  console.log(`[deploy] ✅ published ruleset name=${ruleset.name}`);
  console.log(`[deploy] createTime=${ruleset.createTime}`);
}

main().catch((err) => {
  console.error('[deploy] ❌ failed:', err?.message || err);
  process.exitCode = 1;
});
