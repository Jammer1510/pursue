import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "data");

function writeJson(rel: string, data: unknown): void {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(data)}\n`);
}

async function main(): Promise<void> {
  if (process.env.VERCEL) {
    console.log("[build-static] VERCEL detected; using committed public/data JSON");
    return;
  }

  const {
    getAllEventLocations,
    getAllEventSummaries,
    getEventById,
    getTagAggregates,
  } = await import("../src/lib/queries-sqlite");
  const { closeDb } = await import("../src/lib/db");

  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(path.join(OUT, "events"), { recursive: true, force: true });

  try {
    const summaries = getAllEventSummaries();
    writeJson("summaries.json", summaries);
    writeJson("locations.json", getAllEventLocations());
    writeJson("tags.json", getTagAggregates());

    const search = [];
    for (const summary of summaries) {
      const event = getEventById(summary.id);
      if (!event) throw new Error(`Event ${summary.id} disappeared during static build`);
      writeJson(`events/${summary.id}.json`, event);
      search.push({
        id: event.id,
        title: event.title,
        title_zh: event.title_zh,
        summary: event.summary,
        summary_zh: event.summary_zh,
        incident_location: event.incident_location,
        incident_location_zh: event.incident_location_zh,
        bust_reasoning: event.bust_reasoning,
        bust_reasoning_zh: event.bust_reasoning_zh,
        claims: event.claims.join(" "),
        claims_zh: event.claims_zh.join(" "),
      });
    }
    writeJson("search.json", search);

    console.log(`[build-static] wrote ${summaries.length} event files + 4 indexes to ${OUT}`);
  } finally {
    closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
