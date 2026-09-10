import type { Track } from "../shared/contracts.js";

export type Album = {
  key: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  tracks: Track[];
};

export function buildAlbumGroups(
  tracks: Track[],
  displayAlbum: (value?: string) => string = (value) => value ?? "",
  displayArtist: (value?: string) => string = (value) => value ?? ""
): Album[] {
  const albums = new Map<string, Album>();
  for (const track of tracks) {
    const albumTitle = track.album.trim();
    const albumArtist = track.albumArtist?.trim() || track.artist.trim();
    const key = `${normalizeAlbumIdentity(albumArtist)}\u0000${normalizeAlbumIdentity(albumTitle)}`;
    const album = albums.get(key) ?? {
      key,
      title: displayAlbum(albumTitle),
      artist: displayArtist(albumArtist),
      artworkUrl: track.artworkUrl,
      tracks: []
    };
    album.artworkUrl ??= track.artworkUrl;
    album.tracks.push(track);
    albums.set(key, album);
  }
  return [...albums.values()].sort((left, right) =>
    left.artist.localeCompare(right.artist) || left.title.localeCompare(right.title));
}

function normalizeAlbumIdentity(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
