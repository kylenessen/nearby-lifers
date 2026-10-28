# Nearby Lifers

Nearby Lifers is a responsive website for finding iNaturalist species that you have not observed yet. Run a search, copy its link, or bookmark it. Opening that link restores the settings and fetches current results. There is no installation step, service worker, local storage, or saved account state.

## Searching and sharing

Enter one or more iNaturalist usernames, separated by commas. Their worldwide species lists are combined. An observation from any listed user makes that species already observed. The life list always includes Research Grade and Needs ID. Casual observations also count by default. Select “Exclude users’ casual observations” to leave them out. All dates and locations count toward the life list. Identifications above species rank cannot establish that a particular species has been observed. Subspecies observations count toward their parent species.

Nearby results use the selected location, months, and life groups. Months apply across all years. The initial search uses the previous, current, and next month. Once a URL is created, those months are explicit and stay fixed when that bookmark is reopened. Nearby casual-only and expected-range filters are separate from the users’ life-list quality setting. “Include already observed species” adds those species to the display and marks them as seen.

The address changes when you run a search. Display filters and print settings update it immediately. Unsaved search edits are labeled, and sharing and printing are disabled until the new search runs. Browser Back and Forward restore previous searches. Each bookmark can be added to a phone’s home screen using the browser’s normal website shortcut feature. Mobile bookmarks open with the search controls collapsed so results are visible immediately. Use Edit search to change them.

All settings live in query parameters. These include `users`, `area`, coordinates or `place`, `radius`, `months`, `groups`, `user_casual`, `hide_casual`, `hide_unexpected`, `show_observed`, `layout`, `paper`, and `density`. `v=1` identifies the URL format. Polygon vertices use latitude and longitude pairs in `polygon`. Links preserve a deployment subdirectory such as `/nearby-lifers/`. Invalid locations or unsupported URL versions show an error instead of running a different search.

## Map selection

Explore mode lets you move the map without changing the selected area. Radius mode sets a center with one tap. Rectangle mode uses two opposite corners and previews the boundary. Polygon mode lets you tap corners, undo points, drag numbered corners, and finish the shape. Existing polygons can be edited. Escape cancels drawing. With the map focused, arrow keys pan and Enter adds a point at the center. Place search accepts an iNaturalist place name or ID.

The iNaturalist API supports radius, rectangle, and place queries directly. For polygons, Nearby Lifers loads observations in the bounding rectangle and tests their public coordinates against the polygon. Points outside the polygon do not contribute species or counts. Obscured coordinates may be imprecise, and private coordinates are unavailable. Concave polygons are supported. Crossing edges and polygons spanning the international date line are rejected.

Polygon searches are limited to 10,000 observations in the bounding rectangle after month and life-group filtering. Larger searches fail with instructions to narrow the query. No partial list is presented as complete. Requests are spaced below 100 per minute, paginated, and canceled when a newer search replaces them. No API key is needed. The implementation uses the [iNaturalist v1 API](https://api.inaturalist.org/v1/docs/).

## Printing

Choose a photo grid or a compact taxon checklist, then open Print options. The preview and printout contain the same visible species. Letter measures 8.5 by 11 inches. Half Letter measures 5.5 by 8.5 inches. A5 measures 148 by 210 mm, and A6 measures 105 by 148 mm. Comfortable, Compact, and Large density settings adjust the grid or checklist text and column count.

Photo grids use checkboxes, names, scientific names, and photo credits. Checklists group names by life group, repeat group headings across columns, and paginate using measured text heights. Both include the search context, date, and page numbers. Print or save PDF through the browser dialog. Match the selected paper size, use 100 percent scale, and disable browser headers and footers. Half Letter is one 5.5 by 8.5 inch sheet per page, not two sheets imposed on Letter. Mobile print dialogs vary in their paper-size support.

## Development

Use Node 22.18 or later. Install dependencies and start the development server with the following commands.

```sh
npm install
npm run dev
```

Run the checks with the following commands. The browser suite uses deterministic API fixtures and checks URL restoration, history, quality filters, polygon controls, mobile layout, and every paper, density, and print-format combination.

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

GitHub Pages builds use `GITHUB_PAGES=true npm run build`. Deployment remains a separate step.
