# Design system

The work of [#13](https://github.com/mdastpak/crypto-blog/issues/13): one set of tokens and components for every page, brand, direction, and theme.

## Tokens

Color tokens are semantic: they name a role, not a color. They live in `apps/web/src/design/tokens.ts`:

| Token                                    | Role                                              | Tailwind                                          |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `background`, `surface`, `surface-muted` | Page, cards and header, table heads and skeletons | `bg-background`, `bg-surface`, `bg-surface-muted` |
| `border`                                 | Lines and outlines                                | `border-border`                                   |
| `text`, `text-muted`                     | Body text, secondary text                         | `text-text`, `text-muted`                         |
| `primary`, `primary-contrast`            | Main actions and text on them                     | `bg-primary text-primary-contrast`                |
| `accent`                                 | Highlights                                        | `text-accent`                                     |
| `success`, `danger`, `warning`, `info`   | States and badges                                 | `text-success`, …                                 |
| `up`, `down`                             | Price went up / down                              | `text-up`, `text-down`                            |
| `focus`                                  | Focus rings                                       | (applied to `:focus-visible`)                     |

Components use these only, never raw colors such as `text-red-600`, so that a brand or theme changes every page at once.

Other tokens: `rounded-card`, `shadow-card`, the `tabular` utility (tabular digits for prices), and the font stacks (`font-sans` Inter, `font-persian` Vazirmatn, applied to `:lang(fa)`).

## Palettes and contrast

`BASE_PALETTES` holds the light and dark values of every token. `CONTRAST_PAIRS` lists the pairs that must stay readable and their minimum WCAG ratio (4.5 for text, 3 for large text and UI parts). A test checks every pair for every brand in both themes, so a palette that fails AA cannot be merged.

## Brands

A brand (`apps/web/src/design/brands.ts`) is data only:

- `name` per locale, `logo` (light and dark) and `favicon` under `apps/web/public/brands/<id>/`;
- `palette`: overrides of the base palettes, only what differs;
- `marketColors`: `green-up` (most markets) or `red-up` (China, Japan, Korea), which swaps `up` and `down`.

The release picks its brand with `BRAND` (default `default`); country sites (#3) may pick their own. The layout writes the brand's tokens as CSS custom properties in `<head>`: light by default, dark for `data-theme="dark"` and for the system setting when no theme is chosen.

To add a brand: add its entry to `BRANDS`, put its logos and favicon in `public/brands/<id>/`, run the tests (contrast, names, files), and set `BRAND=<id>`.

## Components

`apps/web/src/components/ui`:

| Component                   | Use                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`, `ButtonLink`      | Actions; `primary`, `secondary`, `ghost`; `sm`, `md`                                                                                 |
| `Badge`                     | Short status, e.g. `unverified`                                                                                                      |
| `Card`                      | A surface for grouped content                                                                                                        |
| `DataTable`                 | Captioned tables: sticky header, sideways scroll on phones, numbers aligned to the end with tabular digits, columns hidden on phones |
| `PriceChange`               | A signed change in the up/down color; the sign is always shown, so color is never the only signal                                    |
| `Sparkline`                 | A small price line, colored by trend, labeled for screen readers                                                                     |
| `Breadcrumbs`, `Pagination` | Navigation; chevrons follow the reading direction                                                                                    |
| `Skeleton`, `EmptyState`    | Loading and empty states                                                                                                             |

## UX rules

- **Direction**: use logical utilities (`ms-*`, `pe-*`, `start-*`, `text-start`, `text-end`). Charts keep time running left to right in every locale. Direction-dependent glyphs use bidi-mirrored characters (`‹ ›`) rather than CSS flips.
- **Numbers**: Persian digits in `fa` (`src/i18n/format.ts`), `tabular` in tables. An identifier inside a sentence (`BTC/USDT`, an address) is isolated by the translator.
- **Accessibility**: AA contrast (tested), visible focus rings, a skip link, labeled navigation landmarks, `prefers-reduced-motion` respected, color never the only signal.
- **Data honesty**: market data that is not verified by the exchange carries an `unverified` badge; prices show their source.

## Gallery

With `DESIGN_GALLERY=true`, `/{locale}/design` shows every token with its contrast ratios and every component in the release's brand. Switch the theme and locale in the header to check each combination. It is never indexed and is off by default; keep it off in production.
