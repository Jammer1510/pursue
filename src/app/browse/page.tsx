import { BrowseTable } from "@/components/browse-table";
import {
  getAllEventSummaries,
  getDistinctAgencies,
  getDistinctDocumentTypes,
  getEventCount,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function BrowsePage() {
  const initial = getAllEventSummaries();
  const agencies = getDistinctAgencies();
  const documentTypes = getDistinctDocumentTypes();
  const total = getEventCount();
  return <BrowseTable initial={initial} agencies={agencies} documentTypes={documentTypes} total={total} />;
}
