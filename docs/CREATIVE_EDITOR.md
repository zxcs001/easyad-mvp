# Advertiser creative editor

The digital creative workflow now supports visual editing alongside the existing plain-text fields and advanced HTML option. The three starter themes remain available, with independent copy and design settings for each theme.

## Editing

- Choose a built-in palette or custom background, text, and accent colours. A contrast advisory helps identify combinations that may be difficult to read.
- Choose a split, centred, or type-first layout, one of four system-font styles, and a headline size from 80% to 110%. Decorative artwork can be hidden.
- Upload a PNG/JPEG logo. The authenticated endpoint checks the file signature, decodes the image, strips metadata, and resizes it to fit 512 × 320 pixels. Input is capped at 2 MB and embedded output at 128 KB. SVG and external URLs are rejected.
- Save or apply a brand in the current browser, scoped to the signed-in account. Applying a brand changes colours, typography, and logo while preserving the campaign's layout and copy.
- Undo and redo changes using the buttons or Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, and Ctrl+Y. Typing in one field is grouped into undo steps; history is capped at 30 snapshots and resets when switching campaigns.

The selected preview renders at the placement's canonical dimensions and scales to fit its panel. The enlarged preview uses the same document. The safe-zone guide is an editor overlay and is omitted from submitted artwork.

## Drafts and submission

Editable copy, design settings, advanced HTML, and QR destination are saved locally after 350 ms, on campaign switches, and on page navigation. Keys include both account and booking IDs. Draft restoration validates bounded field lengths and the design vocabulary; stored dimensions cannot override a booked placement.

Local drafts and brands stay in this browser; they do not sync between devices. Uploaded artwork files must be selected again after a reload. Storage failures leave the editor usable and show an accurate save status. Static billboards continue to require uploaded print artwork.

Preview and submission use the same server renderer and design validation. The image is also decoded before it can be embedded in either document. Fonts, colours, and layouts use a small allowlist rather than user-authored CSS. User HTML continues through the existing sanitizer; only the server adds the validated logo and generated QR SVG. CSP permits embedded data images while retaining the sandbox and blocked external resources.

Submitting saves a complete HTML artifact for the existing creative-review flow. No approval or publication is performed by the editor. Later local changes do not alter a previously submitted artifact.

## Limits

This is a guided template editor. It does not implement a freeform canvas, arbitrary image composition, cloud brand management, or raster/PDF export. The safe-zone guide and glance/contrast advice help review; they do not certify every possible advanced HTML arrangement or long headline. Users should inspect their copy at the booked aspect ratio before submission.

## Verification

Focused automated coverage includes design validation, real image decoding and resizing, rejected image/CSS inputs, preview/submission equivalence, local draft isolation and restoration, grouped undo/redo, upload failures, and canonical output dimensions. Browser coverage exercises actual logo upload, brand reuse, campaign switching, reload, enlarged preview, phone scaling, and submission into review. Layout checks cover all three themes and four font choices across three layouts, at 1920 × 1080 and 3000 × 1000, with a logo, QR, and maximum headline scale. Wider canvases use tighter vertical spacing and 10% outer margins.

Verification images: [desktop](verification/creative-editor-desktop.png) and [phone](verification/creative-editor-phone.png).

October 11, 2026: all 464 regression tests passed; the final renderer checks, TypeScript check, and production build passed. Chrome browser verification passed the editor flow, 72 layout/font/format combinations, and the existing sanitization, approval, and offline-player flow.
