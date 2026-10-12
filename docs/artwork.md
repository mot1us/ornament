# Christmas artwork

The original illustration is preserved in `assets/christmas-friends.png`, generated
with the built-in image generation tool for the requested Charlie Brown Christmas
redesign. It replaces the previous clay Christmas illustration in the interface.

The app serves transparent WebP variants at 480 and 1200 pixels wide, instead of
the 2.1 MB PNG. They are about 51 KB and 210 KB. Responsive sizing chooses the
smaller variant for the family view on phones. High fetch priority and an early
family-view preload start the download before profile requests finish. Only
content-fingerprinted artwork uses a long-lived public cache; private API
responses keep `no-store`. New artwork content gets a new filename.

To recreate the variants, resize the source with Lanczos resampling and encode
as WebP at quality 85, method 6, preserving transparency. Filenames include the
first 12 hex digits of the encoded file's SHA-256. Pillow supports this workflow.

The Short Stack display font is served locally from `public/fonts/`. Its original
[SIL Open Font License](../public/fonts/OFL-ShortStack.txt) is included. Source:
[Google Fonts](https://github.com/google/fonts/tree/main/ofl/shortstack).
The app makes no external font or artwork requests.

## Illustration prompt

```text
Use case: illustration-story.
Asset type: Christmas illustration for the Ornament family Secret Santa website, placed on pale ivory paper.
Primary request: a fun, cute Charlie Brown Christmas scene: Charlie Brown in a mustard yellow coat and winter hat, Snoopy in a red scarf, and Woodstock beside the iconic tiny sparse Christmas tree with a single red ornament and Linus's blue blanket wrapped around its base. Snoopy holds a small sealed wishlist envelope. Their expressions are sweet and quietly delighted.
Style/medium: charming hand-drawn 2D animation cel illustration with expressive wobbly black ink outlines, simple flat colors, lightly textured vintage paper, and the gentle mid-century Christmas TV special feel.
Composition/framing: landscape illustration, full characters and tree, balanced compact group on a small snowy ground patch, generous transparent space around the scene. It must remain legible at 300–500 pixels wide. No rectangular background, no lettering, no logos, no watermark, no interface.
Mood and palette: cozy, tender, playful; mustard yellow, forest green, faded sky blue, warm red, charcoal black, warm white snow.
Constraints: a genuinely transparent background, clean cutout edges, no pixel art, no 3D, no photorealism.
```

## Motion

Buttons respond to hover and press; gift cards slide in, letters animate into
their saved view, and a little envelope flies away after a successful first
submission. Editing and match reveals use brief card transitions. Success
animation runs after the server has saved the list. Reduced-motion preferences
skip transitions and the envelope animation. Motion does not change submission,
approval, privacy, matching, or email behavior.
