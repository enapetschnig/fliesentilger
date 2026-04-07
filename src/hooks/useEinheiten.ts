import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_EINHEITEN = ["Stk.", "m²", "m³", "lfm", "Std.", "Pauschal", "kg", "t", "Liter", "Sack", "Gebinde", "Pkg.", "Blatt", "Rolle", "Dose", "Tube", "Karton", "Palette", "Eimer"];

export function useEinheiten() {
  const [einheiten, setEinheiten] = useState<string[]>(DEFAULT_EINHEITEN);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "einheiten")
          .single();
        if (data?.value) {
          const saved = data.value.split(",").map((e: string) => e.trim()).filter(Boolean);
          // Merge: saved list + any defaults not already in saved
          const merged = [...saved];
          for (const d of DEFAULT_EINHEITEN) {
            if (!merged.includes(d)) merged.push(d);
          }
          setEinheiten(merged);
        }
      } catch {
        // Use defaults
      }
    })();
  }, []);

  return einheiten;
}

export { DEFAULT_EINHEITEN };
