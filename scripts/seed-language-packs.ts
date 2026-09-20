/**
 * @file scripts/seed-language-packs.ts
 * @description Seed EU + Arabic admin catalogs from English with reviewed chrome overlays.
 *
 * Writes `src/messages/{fr,es,it,nl,pl,ar}.json` (clone of EN + overlay) and
 * updates `project.inlang/settings.json` locales. Machine-translate remains
 * available via `bun translate` for keys not in the overlay.
 *
 * Features:
 * - clones missing keys from English
 * - applies a reviewed overlay for high-visibility chrome
 * - keeps $schema
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MESSAGES = join(ROOT, "src/messages");
const SETTINGS = join(ROOT, "project.inlang/settings.json");

const LOCALES = ["en", "de", "fr", "es", "it", "nl", "pl", "ar"] as const;

type Overlay = Record<string, string>;

const OVERLAYS: Record<string, Overlay> = {
  fr: {
    activate: "Activer",
    MediaGallery_Search: "Rechercher",
    Collections_MediaGallery: "Médiathèque",
    button_save: "Enregistrer",
    button_cancel: "Annuler",
    button_delete: "Supprimer",
    button_add: "Ajouter",
    button_edit: "Modifier",
    button_apply: "Appliquer",
    button_close: "Fermer",
    button_confirm: "Confirmer",
    button_back: "Retour",
    button_next: "Suivant",
    dashboard: "Tableau de bord",
    button_Collections: "Collections",
  },
  es: {
    activate: "Activar",
    MediaGallery_Search: "Buscar",
    Collections_MediaGallery: "Galería de medios",
    button_save: "Guardar",
    button_cancel: "Cancelar",
    button_delete: "Eliminar",
    button_add: "Añadir",
    button_edit: "Editar",
    button_apply: "Aplicar",
    button_close: "Cerrar",
    button_confirm: "Confirmar",
    button_back: "Atrás",
    button_next: "Siguiente",
    dashboard: "Panel",
    button_Collections: "Colecciones",
  },
  it: {
    activate: "Attiva",
    MediaGallery_Search: "Cerca",
    Collections_MediaGallery: "Galleria media",
    button_save: "Salva",
    button_cancel: "Annulla",
    button_delete: "Elimina",
    button_add: "Aggiungi",
    button_edit: "Modifica",
    button_apply: "Applica",
    button_close: "Chiudi",
    button_confirm: "Conferma",
    button_back: "Indietro",
    button_next: "Avanti",
    dashboard: "Dashboard",
    button_Collections: "Collezioni",
  },
  nl: {
    activate: "Activeren",
    MediaGallery_Search: "Zoeken",
    Collections_MediaGallery: "Mediagalerij",
    button_save: "Opslaan",
    button_cancel: "Annuleren",
    button_delete: "Verwijderen",
    button_add: "Toevoegen",
    button_edit: "Bewerken",
    button_apply: "Toepassen",
    button_close: "Sluiten",
    button_confirm: "Bevestigen",
    button_back: "Terug",
    button_next: "Volgende",
    dashboard: "Dashboard",
    button_Collections: "Collecties",
  },
  pl: {
    activate: "Aktywuj",
    MediaGallery_Search: "Szukaj",
    Collections_MediaGallery: "Galeria mediów",
    button_save: "Zapisz",
    button_cancel: "Anuluj",
    button_delete: "Usuń",
    button_add: "Dodaj",
    button_edit: "Edytuj",
    button_apply: "Zastosuj",
    button_close: "Zamknij",
    button_confirm: "Potwierdź",
    button_back: "Wstecz",
    button_next: "Dalej",
    dashboard: "Pulpit",
    button_Collections: "Kolekcje",
  },
  ar: {
    activate: "تفعيل",
    MediaGallery_Search: "بحث",
    Collections_MediaGallery: "معرض الوسائط",
    button_save: "حفظ",
    button_cancel: "إلغاء",
    button_delete: "حذف",
    button_add: "إضافة",
    button_edit: "تعديل",
    button_apply: "تطبيق",
    button_close: "إغلاق",
    button_confirm: "تأكيد",
    button_back: "رجوع",
    button_next: "التالي",
    dashboard: "لوحة التحكم",
    button_Collections: "المجموعات",
  },
};

function main(): void {
  const en = JSON.parse(readFileSync(join(MESSAGES, "en.json"), "utf8")) as Record<string, string>;
  const keys = Object.keys(en);

  for (const locale of ["fr", "es", "it", "nl", "pl", "ar"] as const) {
    const overlay = OVERLAYS[locale] ?? {};
    const next: Record<string, string> = {};
    for (const key of keys) {
      if (key === "$schema") {
        next[key] = en[key];
        continue;
      }
      next[key] = overlay[key] ?? en[key];
    }
    writeFileSync(join(MESSAGES, `${locale}.json`), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(
      `[seed-language-packs] wrote src/messages/${locale}.json (${keys.length} keys, ${Object.keys(overlay).length} overlay)`,
    );
  }

  const settings = JSON.parse(readFileSync(SETTINGS, "utf8")) as {
    locales?: string[];
    languageTags?: string[];
    [k: string]: unknown;
  };
  settings.locales = [...LOCALES];
  settings.languageTags = [...LOCALES];
  writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  console.log(`[seed-language-packs] locales: ${LOCALES.join(", ")}`);
}

main();
