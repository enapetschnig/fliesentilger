const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

interface ExistingItem {
  position: number;
  material: string;
  menge: string;
  einheit: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioBase64, typ, existingItems }: {
      audioBase64: string;
      typ: "entnahme" | "rueckgabe";
      existingItems?: ExistingItem[];
    } = await req.json();

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "Audio data required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing voice input for ${typ}, audio size: ${audioBase64.length} chars`);

    // Step 1: Whisper Transcription
    const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: "audio/webm" }), "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "de");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text();
      console.error("Whisper error:", err);
      return new Response(
        JSON.stringify({ error: "Transkription fehlgeschlagen", details: err }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { text: transcript } = await whisperResponse.json();
    console.log("Transcript:", transcript);

    if (!transcript || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Keine Sprache erkannt", transcript: "" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Step 2: GPT-4o-mini parsing
    let systemPrompt = "";
    if (typ === "entnahme") {
      systemPrompt = `Du bist ein Assistent für Materialerfassung auf einer Baustelle.
Der Benutzer spricht auf Deutsch und beschreibt welches Material er mitnimmt/entnimmt.
Extrahiere aus dem gesprochenen Text eine Liste von Materialien mit Menge und Einheit.

Gültige Einheiten: Stk., m², lfm, kg, Sack, Eimer, Pkg.

Antworte NUR mit validem JSON in diesem Format:
{"items": [{"material": "Fliesen 60x60 anthrazit", "menge": 40, "einheit": "m²"}]}

Wenn du keine Materialien erkennst, antworte: {"items": []}
Keine zusätzlichen Erklärungen, nur JSON.`;
    } else {
      const positionsContext = existingItems?.map(
        (p) => `Position ${p.position}: ${p.material} (${p.menge} ${p.einheit})`
      ).join("\n") || "Keine Positionen vorhanden";

      systemPrompt = `Du bist ein Assistent für Material-Rückgabe auf einer Baustelle.
Der Benutzer spricht auf Deutsch und beschreibt welches Material er zurückgibt.
Er kann sich auf bestehende Positionen beziehen (z.B. "von Position 1 gebe ich 5 zurück").

Bestehende entnommene Positionen:
${positionsContext}

Extrahiere aus dem gesprochenen Text eine Liste von zurückgegebenen Materialien.
Versuche die Materialien den bestehenden Positionen zuzuordnen.

Gültige Einheiten: Stk., m², lfm, kg, Sack, Eimer, Pkg.

Antworte NUR mit validem JSON:
{"items": [{"material": "Fliesen 60x60 anthrazit", "menge": 5, "einheit": "m²"}]}

Keine zusätzlichen Erklärungen, nur JSON.`;
    }

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!chatResponse.ok) {
      const err = await chatResponse.text();
      console.error("GPT error:", err);
      return new Response(
        JSON.stringify({ error: "KI-Verarbeitung fehlgeschlagen", transcript }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const chatData = await chatResponse.json();
    const content = chatData.choices?.[0]?.message?.content || "{}";
    console.log("GPT response:", content);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { items: [] };
    }

    return new Response(
      JSON.stringify({ transcript, items: parsed.items || [] }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
