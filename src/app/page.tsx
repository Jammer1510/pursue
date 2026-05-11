import { Timeline } from "@/components/timeline";
import { getAllEventSummaries, getEventCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function Home() {
  const events = getAllEventSummaries();
  const total = getEventCount();
  if (total === 0) return <EmptyState />;
  return (
    <div>
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Timeline · {total} document{total === 1 ? "" : "s"}
        </h1>
      </header>
      <Timeline events={events} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-32 text-center">
      <h2 className="font-mono text-base text-zinc-300">No data yet</h2>
      <p className="max-w-md text-sm text-zinc-500">
        Run <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-300">npm run ingest</code> to populate the database from the UFO-USA repo.
      </p>
    </div>
  );
}
