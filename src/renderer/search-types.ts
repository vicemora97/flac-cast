export type SearchSort = "artist" | "title" | "album" | "quality";
export type SearchDirection = "asc" | "desc";

export type SearchTrackRecord = {
  id: string;
  title: string;
  artist: string;
  album: string;
  bitsPerSample?: number;
  sampleRate?: number;
  bitrate?: number;
};

export type SearchWorkerRequest =
  | {
      type: "sync";
      generation: number;
      upsert: SearchTrackRecord[];
      remove: string[];
    }
  | {
      type: "search";
      requestId: number;
      query: string;
      sort: SearchSort;
      direction: SearchDirection;
      language: "en" | "es";
    };

export type SearchWorkerResponse =
  | { type: "ready"; generation: number; count: number }
  | { type: "results"; requestId: number; ids: string[]; total: number };
