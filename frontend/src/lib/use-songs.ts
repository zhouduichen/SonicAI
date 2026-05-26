"use client";

import { useState, useEffect } from "react";
import type { Song } from "@/types";
import * as api from "@/lib/api";
import { logError } from "@/lib/error-handler";

export function useSongs(activeTab: string) {
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    if (activeTab !== "create" && activeTab !== "archive") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSongList();
        if (!cancelled && data.items && data.items.length > 0) {
          setSongs(data.items.map((item: api.SongItem) => ({
            id: String(item.id), theme: item.theme || "", status: item.status as Song["status"],
            lyrics: item.lyrics || "", instrumentalPath: item.instrumental_path || "",
            vocalPath: item.vocal_path || "", mixedPath: item.mixed_path || "",
            createdAt: item.created_at || "", errorMessage: item.error_message || "",
            lyricsProvider: item.lyrics_provider || "",
            instrumentalProvider: item.instrumental_provider || "",
            svsProvider: item.svs_provider || "",
            vocalProvider: item.vocal_provider || "", hasVocals: item.has_vocals ?? false,
          })));
          return;
        }
      } catch { /* API unavailable */ }
      // Demo fallback
      if (cancelled) return;
      const { MOCK_SONGS } = await import("@/lib/mock-data");
      setSongs(MOCK_SONGS);
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  return { songs, setSongs };
}
