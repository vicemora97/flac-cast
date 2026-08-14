import type { SearchTrackRecord, SearchWorkerRequest, SearchWorkerResponse } from "./search-types.js";

type IndexedTrack = SearchTrackRecord & {
  normalizedTitle: string;
  normalizedArtist: string;
  normalizedAlbum: string;
  searchText: string;
};

const records = new Map<string, IndexedTrack>();
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null;
  postMessage(message: SearchWorkerResponse): void;
};

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "sync") {
    message.remove.forEach((id) => records.delete(id));
    message.upsert.forEach((track) => records.set(track.id, indexTrack(track)));
    workerScope.postMessage({ type: "ready", generation: message.generation, count: records.size });
    return;
  }

  const query = normalizeSearchText(message.query);
  const terms = query.split(" ").filter(Boolean);
  if (terms.length === 0) {
    workerScope.postMessage({ type: "results", requestId: message.requestId, ids: [], total: 0 });
    return;
  }
  const matches = [...records.values()].filter((track) => terms.every((term) => track.searchText.includes(term)));
  const collator = new Intl.Collator(message.language, { sensitivity: "base", numeric: true });
  matches.sort(createComparator(message.sort, collator));
  workerScope.postMessage({
    type: "results",
    requestId: message.requestId,
    ids: matches.map((track) => track.id),
    total: matches.length
  });
};

function indexTrack(track: SearchTrackRecord): IndexedTrack {
  const normalizedTitle = normalizeSearchText(track.title);
  const normalizedArtist = normalizeSearchText(track.artist);
  const normalizedAlbum = normalizeSearchText(track.album);
  return {
    ...track,
    normalizedTitle,
    normalizedArtist,
    normalizedAlbum,
    searchText: `${normalizedTitle}\n${normalizedArtist}\n${normalizedAlbum}`
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function createComparator(sort: "artist" | "title" | "quality", collator: Intl.Collator): (left: IndexedTrack, right: IndexedTrack) => number {
  const byArtist = (left: IndexedTrack, right: IndexedTrack) => collator.compare(left.artist, right.artist)
    || collator.compare(left.title, right.title)
    || collator.compare(left.album, right.album);
  if (sort === "quality") {
    return (left, right) => (right.bitsPerSample ?? 0) - (left.bitsPerSample ?? 0)
      || (right.sampleRate ?? 0) - (left.sampleRate ?? 0)
      || byArtist(left, right);
  }
  if (sort === "title") {
    return (left, right) => collator.compare(left.title, right.title)
      || collator.compare(left.artist, right.artist)
      || collator.compare(left.album, right.album);
  }
  return byArtist;
}
