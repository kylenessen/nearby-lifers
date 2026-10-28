# Nearby Lifers

Nearby Lifers is a responsive website for finding iNaturalist species that you have not observed yet. Run a search, copy its link, or bookmark it. Opening that link restores the settings and fetches current results. There is no installation step, service worker, local storage, or saved account state.

## Searching and sharing

Use the Username field to search iNaturalist by login or display name. Choose a match with the pointer or arrow keys and Enter, or enter an exact username directly. Links containing multiple comma-separated usernames still work. Their worldwide species lists are combined, and an observation from any listed user makes that species already observed. The life list always includes Research Grade and Needs ID. Casual observations also count by default. Select “Exclude users’ casual observations” to leave them out. All dates and locations count toward the life list. Identifications above species rank cannot establish that a particular species has been observed. Subspecies observations count toward their parent species.

Nearby results use the selected location, months, and life groups. Months apply across all years. The initial search uses the previous, current, and next month. Once a URL is created, those months are explicit and stay fixed when that bookmark is reopened. Nearby casual-only and expected-range filters are separate from the users’ life-list quality setting. “Include already observed species” adds those species to the display and marks them as seen.

The address changes when you run a search. Display filters and print settings update it immediately. Unsaved search edits are labeled, and sharing and printing are disabled until the new search runs. Browser Back and Forward restore previous searches. Each bookmark can be added to a phone’s home screen using the browser’s normal website shortcut feature. Mobile bookmarks open with the search controls collapsed so results are visible immediately. Use Edit search to change them.

All settings live in query parameters. These include `users`, `area`, coordinates or `place`, `radius`, `months`, `groups`, `user_casual`, `hide_casual`, `hide_unexpected`, `show_observed`, `layout`, `paper`, `density`, `sort`, `grouping`, `print`, and `title`. `v=1` identifies the URL format. New display options have defaults, so earlier links continue to work. Polygon vertices use latitude and longitude pairs in `polygon`. Links preserve a deployment subdirectory such as `/nearby-lifers/`. Invalid locations or unsupported URL versions show an error instead of running a different search.

The checklist uses iNaturalist taxonomic ancestry to group species. Taxonomic groups use families such as ducks and geese or herons, with Passeriformes grouped together as perching birds. You can instead group everything by family or order. Missing ancestry falls back to the life group. Sort by common name, scientific name, or reported observation count within groups. Set Group by to None for a single globally sorted list. Photo grids use the selected sort order. Large, Comfortable, Compact, and Extra compact densities affect both screen and print layouts.

## Map selection

Explore mode lets you move the map without changing the selected area. Radius mode sets a center with one tap. Rectangle mode uses two opposite corners and previews the boundary. Polygon mode lets you tap corners, undo points, drag numbered corners, and finish the shape. Existing polygons can be edited. Escape cancels drawing. With the map focused, arrow keys pan and Enter adds a point at the center. Place search accepts an iNaturalist place name or ID.

The iNaturalist API supports radius, rectangle, and place queries directly. For polygons, Nearby Lifers loads observations in the bounding rectangle and tests their public coordinates against the polygon. Points outside the polygon do not contribute species or counts. Obscured coordinates may be imprecise, and private coordinates are unavailable. Concave polygons are supported. Crossing edges and polygons spanning the international date line are rejected.

Polygon searches are limited to 10,000 observations in the bounding rectangle after month and life-group filtering. Larger searches fail with instructions to narrow the query. No partial list is presented as complete. Requests are spaced below 100 per minute, paginated, and canceled when a newer search replaces them. No API key is needed. The implementation uses the [iNaturalist v1 API](https://api.inaturalist.org/v1/docs/).

## Printing

Choose a photo grid or a compact taxon checklist, then open Print options. The preview and printout contain the same visible species. Letter measures 8.5 by 11 inches. Half Letter measures 5.5 by 8.5 inches. A5 measures 148 by 210 mm, and A6 measures 105 by 148 mm. Density settings adjust the grid or checklist text and column count.

Photo grids use checkboxes, names, scientific names, and photo credits. Checklists use the selected taxonomy grouping and sort order, repeat group headings across columns, and paginate using measured row and heading heights. Both include the search context, date, and page numbers. Print or save PDF through the browser dialog. Match the selected paper size, use 100 percent scale, and disable browser headers and footers. In Individual sheets mode, Half Letter is one 5.5 by 8.5 inch sheet per page. Mobile print dialogs vary in their paper-size support.

Choose Folded booklet to print on landscape Letter paper and fold to a 5.5 by 8.5 inch booklet. It includes an editable title cover, the checklist or photo grid, and a blank back cover. Blank pages are added after the checklist as needed to reach a multiple of four. The preview labels each sheet front and back. Blank-page labels and the fold guide appear only in the preview.

The output is already arranged in folding order, with two booklet pages per printed side. Print double-sided with short-edge flipping at 100 percent scale. Disable browser headers and footers, and leave the printer's own booklet or multiple-pages-per-sheet modes off. The browser cannot set the printer's duplex controls. Stack the sheets in order, fold, and staple along the spine. The crease is 5.5 inches from the edge, so a stapler needs at least that much reach. A long-reach stapler is suitable. For example, [Bostitch's booklet stapler guidance](https://bostitchoffice.com/long-reach-stapler-black.html) describes a 12-inch reach for centerline stapling. Check its sheet capacity against the number shown in the preview.

## Development

Use Node 22.18 or later. Install dependencies and start the development server with the following commands.

```sh
npm install
npm run dev
```

Run the checks with the following commands. The browser suite uses deterministic API fixtures and checks URL restoration, username search, history, quality filters, taxonomy grouping, sorting, polygon controls, mobile layout, all paper and density combinations, and booklet covers, page order, and PDF dimensions.

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

GitHub Pages builds use `GITHUB_PAGES=true npm run build`. Deployment remains a separate step.
