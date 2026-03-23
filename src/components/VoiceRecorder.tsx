import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Check, X, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ParsedItem {
  material: string;
  menge: number;
  einheit: string;
}

interface ExistingItem {
  position: number;
  material: string;
  menge: string;
  einheit: string;
}

interface VoiceRecorderProps {
  typ: "entnahme" | "rueckgabe";
  existingItems?: ExistingItem[];
  onAccept: (items: ParsedItem[]) => void;
  onCancel: () => void;
}

type RecordingState = "idle" | "recording" | "processing" | "result" | "error";

export function VoiceRecorder({ typ, existingItems, onAccept, onCancel }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };

      mediaRecorder.start();
      setState("recording");
    } catch (err) {
      console.error("Microphone error:", err);
      setErrorMsg("Mikrofon konnte nicht gestartet werden. Bitte Berechtigung erteilen.");
      setState("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("processing");
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      // Convert blob to base64
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const audioBase64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-voice-material", {
        body: {
          audioBase64,
          typ,
          existingItems: typ === "rueckgabe" ? existingItems : undefined,
        },
      });

      if (error) throw error;

      if (data.error && !data.items) {
        setErrorMsg(data.error);
        setState("error");
        return;
      }

      setTranscript(data.transcript || "");
      setItems(data.items || []);
      setState(data.items?.length > 0 ? "result" : "error");
      if (!data.items?.length) {
        setErrorMsg("Keine Materialien erkannt. Bitte nochmal versuchen.");
      }
    } catch (err) {
      console.error("Processing error:", err);
      setErrorMsg("Verarbeitung fehlgeschlagen. Bitte nochmal versuchen.");
      setState("error");
    }
  };

  const updateItem = (idx: number, field: keyof ParsedItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setState("idle");
    setItems([]);
    setTranscript("");
    setErrorMsg("");
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">
            {typ === "entnahme" ? "Material per Sprache entnehmen" : "Material per Sprache zurückgeben"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Info - always show hint and positions during idle/recording/processing */}
      {(state === "idle" || state === "recording" || state === "processing") && (
        <div className="space-y-2">
          {state === "idle" && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
              {typ === "entnahme" ? (
                <>Drücke auf Aufnehmen und sag z.B.: <strong>"Ich habe 40 Quadratmeter Fliesen 60x60 und 5 Sack Fliesenkleber mitgenommen"</strong></>
              ) : (
                <>Drücke auf Aufnehmen und sag z.B.: <strong>"Position 1, davon gebe ich 10 Stück zurück"</strong> oder <strong>"Ich bringe 5 Quadratmeter Fliesen zurück"</strong></>
              )}
            </div>
          )}

          {/* Show existing positions for return reference - ALWAYS visible during recording */}
          {typ === "rueckgabe" && existingItems && existingItems.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded p-3 space-y-1">
              <p className="text-xs font-medium text-green-800">Entnommene Positionen:</p>
              {existingItems.map((item) => (
                <div key={item.position} className="text-xs text-green-700 flex gap-2">
                  <span className="font-bold min-w-[50px]">Pos {item.position}:</span>
                  <span>{item.material}</span>
                  <span className="text-green-500">({item.menge} {item.einheit})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recording Button */}
      {(state === "idle" || state === "recording") && (
        <div className="flex justify-center py-4">
          {state === "idle" ? (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
              <Mic className="h-8 w-8" />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center animate-pulse shadow-lg"
            >
              <MicOff className="h-8 w-8" />
            </button>
          )}
        </div>
      )}
      {state === "recording" && (
        <p className="text-center text-sm text-red-600 font-medium">Aufnahme läuft... Drücke zum Stoppen</p>
      )}

      {/* Processing */}
      {state === "processing" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">KI verarbeitet Sprache...</p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="space-y-3">
          <p className="text-sm text-destructive text-center">{errorMsg}</p>
          {transcript && (
            <p className="text-xs text-muted-foreground text-center">Erkannter Text: "{transcript}"</p>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              Nochmal
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Results */}
      {state === "result" && items.length > 0 && (
        <div className="space-y-3">
          {/* Transcript */}
          {transcript && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              Erkannt: "{transcript}"
            </div>
          )}

          {/* Editable items */}
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                <Input
                  value={item.material}
                  onChange={(e) => updateItem(idx, "material", e.target.value)}
                  className="flex-1 h-8 text-sm"
                  placeholder="Material"
                />
                <Input
                  type="number"
                  value={item.menge}
                  onChange={(e) => updateItem(idx, "menge", Number(e.target.value))}
                  className="w-20 h-8 text-sm text-right"
                  min={0}
                  step={0.1}
                />
                <Select value={item.einheit} onValueChange={(v) => updateItem(idx, "einheit", v)}>
                  <SelectTrigger className="w-20 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stk.">Stk.</SelectItem>
                    <SelectItem value="m²">m²</SelectItem>
                    <SelectItem value="lfm">lfm</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="Sack">Sack</SelectItem>
                    <SelectItem value="Eimer">Eimer</SelectItem>
                    <SelectItem value="Pkg.">Pkg.</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-8 w-8 p-0">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <Badge variant="secondary" className="text-xs">
            {items.length} {items.length === 1 ? "Position" : "Positionen"} erkannt
          </Badge>

          {/* Action Buttons */}
          <div className="flex justify-between pt-1">
            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              Nochmal
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>Verwerfen</Button>
              <Button
                size="sm"
                onClick={() => onAccept(items.filter(i => i.material.trim() && i.menge > 0))}
                className="gap-1"
              >
                <Check className="h-3.5 w-3.5" />
                Übernehmen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
