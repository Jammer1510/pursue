import { dataSource, type TagAggregate } from "./data-source";
import type { EventFilters } from "./types";

export type { TagAggregate };

export function getEventById(id: number) {
  return dataSource.getEventById(id);
}

export function getEventLocations(eventId: number) {
  return dataSource.getEventLocations(eventId);
}

export function getAllEventLocations() {
  return dataSource.getAllEventLocations();
}

export function getAllEventSummaries() {
  return dataSource.getAllEventSummaries();
}

export function searchEvents(filters: EventFilters) {
  return dataSource.searchEvents(filters);
}

export function getDistinctAgencies() {
  return dataSource.getDistinctAgencies();
}

export function getDistinctDocumentTypes() {
  return dataSource.getDistinctDocumentTypes();
}

export function getTagAggregates() {
  return dataSource.getTagAggregates();
}

export function getEventsByTagIntersection(tags: Array<{ category: string; tag: string }>) {
  return dataSource.getEventsByTagIntersection(tags);
}

export function getEventCount() {
  return dataSource.getEventCount();
}
