# Nearby business removal — local browser check

Verified at http://localhost:3001 on October 4, 2026 using the in-app browser. No unit tests or scripted test runner were used.

- The intro map loads with 3D buildings and geographic labels; provider POI layers are hidden.
- The portal inventory map renders the 13 available screen markers with no Nearby business control or legend entry.
- Searching for Starbucks returns No map matches. Clearing search restores the normal map search field.
- Screen markers and map navigation remain available.

The Google inventory map configuration now hides business POIs and disables default clickable POI icons. That separate Google test page was not verified in the browser. The existing OpenStreetMap raster basemap is unchanged; any labels baked into provider tiles are background cartography, not application business markers or search results.

TypeScript compilation and the diff whitespace check (with CRLF line endings recognized) passed.

Screenshots: /tmp/easyad-browser-qa/nearby-business-removed-intro.jpg and /tmp/easyad-browser-qa/nearby-business-removed-map.jpg.

Implementation references: [Google business POI styling](https://developers.google.com/maps/documentation/javascript/examples/hiding-features), [OpenFreeMap style customization](https://openfreemap.org/quick_start/).
