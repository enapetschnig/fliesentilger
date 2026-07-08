export interface WorkTimePreset {
  startTime: string;
  endTime: string;
  pauseStart: string;
  pauseEnd: string;
  pauseMinutes: number;
  totalHours: number;
}

/**
 * Umstellung der Regelarbeitszeit ab 1. Juli 2026:
 *  - bis Juni 2026:  Mo-Do 8,5h, Fr 5,0h
 *  - ab  Juli 2026:  Mo-Do 8,0h, Fr 7,0h
 * (Wochensoll bleibt in beiden Modellen 39h.)
 *
 * Vergleich über Jahr/Monat (lokale Komponenten) — robust gegenüber
 * Zeitzonen-Verschiebungen bei aus ISO-Strings geparsten Datumswerten.
 */
export function isNewHoursModel(date: Date): boolean {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-basiert, Juli = 6
  return y > 2026 || (y === 2026 && m >= 6);
}

/**
 * Gibt die Normalarbeitszeit für einen Tag zurück
 * bis Juni 2026: Mo-Do 8.5h, Fr 5.0h, Sa-So 0h
 * ab Juli 2026:  Mo-Do 8.0h, Fr 7.0h, Sa-So 0h
 */
export function getNormalWorkingHours(date: Date): number {
  const dayOfWeek = date.getDay();

  // Wochenende
  if (dayOfWeek === 0 || dayOfWeek === 6) return 0;

  const neu = isNewHoursModel(date);

  // Montag - Donnerstag
  if (dayOfWeek >= 1 && dayOfWeek <= 4) return neu ? 8.0 : 8.5;

  // Freitag
  if (dayOfWeek === 5) return neu ? 7.0 : 5.0;

  return 0;
}

/**
 * Gibt die Freitags-Überstunde zurück (keine mehr — Fr ist volle Normalarbeitszeit)
 */
export function getFridayOvertime(date: Date): number {
  return 0;
}

/**
 * Gibt die tatsächlichen Arbeitsstunden für einen Tag zurück
 * (= Normalarbeitszeit, datumsabhängig)
 */
export function getTotalWorkingHours(date: Date): number {
  return getNormalWorkingHours(date);
}

/**
 * Gibt die Sollstunden für eine Woche zurück: 39 Stunden
 * (bis Juni: 4 × 8.5 + 1 × 5.0 = 39 · ab Juli: 4 × 8.0 + 1 × 7.0 = 39)
 */
export function getWeeklyTargetHours(): number {
  return 39;
}

/**
 * Gibt Standard-Arbeitszeiten für einen Tag zurück (datumsabhängig)
 */
export function getDefaultWorkTimes(date: Date): WorkTimePreset | null {
  const dayOfWeek = date.getDay();

  // Wochenende
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;

  const neu = isNewHoursModel(date);

  // Montag - Donnerstag
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    return neu
      ? { startTime: "07:00", endTime: "15:30", pauseStart: "12:00", pauseEnd: "12:30", pauseMinutes: 30, totalHours: 8.0 }
      : { startTime: "07:00", endTime: "16:00", pauseStart: "12:00", pauseEnd: "12:30", pauseMinutes: 30, totalHours: 8.5 };
  }

  // Freitag
  if (dayOfWeek === 5) {
    return neu
      ? { startTime: "07:00", endTime: "14:30", pauseStart: "12:00", pauseEnd: "12:30", pauseMinutes: 30, totalHours: 7.0 }
      : { startTime: "07:00", endTime: "12:00", pauseStart: "", pauseEnd: "", pauseMinutes: 0, totalHours: 5.0 };
  }

  return null;
}

/**
 * Prüft ob ein Tag ein arbeitsfreier Tag ist (nur Wochenende)
 */
export function isNonWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();

  // Nur Wochenende ist arbeitsfrei
  return dayOfWeek === 0 || dayOfWeek === 6;
}
