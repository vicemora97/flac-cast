export type SearchSort = "artist" | "title" | "quality";

export type SearchTrackRecord = {
  id: string;
  title: string;
  artist: string;
  album: string;
  bitsPerSample?: number;
  sampleRate?: number;
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
      language: "en" | "es";
    };

export type SearchWorkerResponse =
  | { type: "ready"; generation: number; count: number }
  | { type: "results"; requestId: number; ids: string[]; total: number };
