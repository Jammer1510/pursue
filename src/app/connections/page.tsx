import { getTagAggregates } from "@/lib/queries";
import { ConnectionsClient } from "./connections-client";

export const dynamic = "force-dynamic";

export default function ConnectionsPage() {
  const aggregates = getTagAggregates();
  return <ConnectionsClient aggregates={aggregates} />;
}
