import type { Locale } from "./config";

export function mapLibreLocale(locale: Locale) {
  if (locale !== "fr") return undefined;
  return {
    "AttributionControl.MapFeedback": "Commentaires sur la carte",
    "AttributionControl.ToggleAttribution": "Afficher ou masquer l’attribution",
    "Map.Title": "Carte",
    "NavigationControl.ResetBearing": "Glissez pour faire pivoter la carte; cliquez pour rétablir le nord",
    "NavigationControl.ZoomIn": "Zoom avant",
    "NavigationControl.ZoomOut": "Zoom arrière",
    "Popup.Close": "Fermer la fenêtre",
  };
}
