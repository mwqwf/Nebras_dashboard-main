import { b as getNebrasFirestoreAdmin } from "./firebaseAdmin.js";
const FILES = "content_unified_files";
const YOUTUBE = "content_unified_youtube";
const AGG_DOC = "aggregates_popular/top_weekly";
async function runAggregatePopularity({ limit = 50 } = {}) {
  const db = getNebrasFirestoreAdmin();
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1e3;
  const monthMs = 30 * 24 * 60 * 60 * 1e3;
  const scored = [];
  const scoreRow = (id, data) => {
    const views = Number(data.view_count ?? data.viewCount ?? 0) || 0;
    const plays = Number(data.play_count ?? data.playCount ?? 0) || 0;
    const score7 = Number(data.popularity_score_7d ?? data.popularityScore7d ?? 0) || views * 3 + plays * 2;
    const lastPlayed = data.last_played_at?.toDate?.() ?? null;
    let trend = score7;
    if (lastPlayed) {
      const age = now - lastPlayed.getTime();
      if (age > weekMs && age <= monthMs) trend += views;
    }
    scored.push({ id: String(id), score: trend, views, plays });
  };
  const [filesSnap, ytSnap] = await Promise.all([
    db.collection(FILES).get(),
    db.collection(YOUTUBE).get()
  ]);
  for (const doc of filesSnap.docs) scoreRow(doc.id, doc.data());
  for (const doc of ytSnap.docs) scoreRow(doc.id, doc.data());
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, limit));
  const ids = top.map((r) => r.id);
  const scores = Object.fromEntries(top.map((r) => [r.id, r.score]));
  await db.doc(AGG_DOC).set(
    {
      ids,
      scores,
      updated_at: /* @__PURE__ */ new Date(),
      scanned: scored.length
    },
    { merge: true }
  );
  return { ids, scores, scanned: scored.length };
}
export {
  runAggregatePopularity as r
};
