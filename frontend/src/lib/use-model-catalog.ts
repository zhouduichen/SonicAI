"use client";

import { useState, useEffect } from "react";
import type { ModelCatalog, ModelInfo } from "@/types";
import {
  DEFAULT_VOCAL_SEPARATION_MODELS,
  DEFAULT_STYLE_EXTRACTION_MODELS,
  DEFAULT_MUSIC_GENERATION_MODELS,
} from "./default-models";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export const DEFAULT_MODEL_CATALOG: ModelCatalog = {
  vocal_separation: DEFAULT_VOCAL_SEPARATION_MODELS,
  style_extraction: DEFAULT_STYLE_EXTRACTION_MODELS,
  music_generation: DEFAULT_MUSIC_GENERATION_MODELS,
};

function mapModel(m: Record<string, unknown>): ModelInfo {
  return {
    key: String(m.key || ""),
    display_name: String(m.display_name || m.key || ""),
    description: String(m.description || ""),
    vram_gb: Number(m.vram_gb ?? 0),
    quality: String(m.quality || ""),
    speed: String(m.speed || ""),
    embedding_dim: m.embedding_dim != null ? Number(m.embedding_dim) : undefined,
    installed: Boolean(m.installed),
    pros: Array.isArray(m.pros) ? m.pros.map(String) : undefined,
    cons: Array.isArray(m.cons) ? m.cons.map(String) : undefined,
  };
}

export function mergeCatalogs(api: ModelCatalog, fallback: ModelCatalog): ModelCatalog {
  const merge = (apiModels: ModelInfo[], fbModels: ModelInfo[]) => {
    const fbMap = new Map(fbModels.map((m) => [m.key, m]));
    return apiModels.map((m) => {
      const fb = fbMap.get(m.key);
      return fb ? { ...fb, ...m, pros: m.pros || fb.pros, cons: m.cons || fb.cons } : m;
    });
  };
  return {
    vocal_separation: merge(api.vocal_separation, fallback.vocal_separation),
    style_extraction: merge(api.style_extraction, fallback.style_extraction),
    music_generation: merge(api.music_generation, fallback.music_generation),
  };
}

export function useModelCatalog(): {
  catalog: ModelCatalog;
  loading: boolean;
} {
  const [catalog, setCatalog] = useState<ModelCatalog>(DEFAULT_MODEL_CATALOG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/models/`)
      .then((res) => {
        if (!res.ok) throw new Error("API unavailable");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const apiCatalog: ModelCatalog = {
          vocal_separation: (data.vocal_separation || []).map(mapModel),
          style_extraction: (data.style_extraction || []).map(mapModel),
          music_generation: (data.music_generation || []).map(mapModel),
        };
        setCatalog(mergeCatalogs(apiCatalog, DEFAULT_MODEL_CATALOG));
      })
      .catch(() => {
        // API unavailable — keep defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { catalog, loading };
}
