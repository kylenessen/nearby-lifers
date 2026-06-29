# Nearby Lifers

Nearby Lifers is a small field prototype for iNaturalist users. It builds a species snapshot for a place and highlights taxa that can add to a user profile species count.

The current prototype defaults to `kylenessen`, latitude `35.32763176091517`, longitude `-120.83909699047472`, and a `1 km` radius. It uses a Leaflet aerial map to preview the search area. The area can be a radius around a point, a drawn rectangle, or an iNaturalist place selected from place search.

The default months are the previous month, current month, and next month. On June 29, 2026, that means May, June, and July. Month choices are part of the snapshot query. Life group chips are local filters after the snapshot is built.

The app queries iNaturalist species counts for the selected area and also queries the user's global observed taxa. It then marks anything already observed anywhere in the world as hidden. Species that are not hidden appear as targets. During a hike, a target can be tapped to hide it from the current snapshot without uploading or syncing anything.

The snapshot also tags species that only have local casual observations and species that iNaturalist does not mark as expected nearby. Both can be hidden locally after the snapshot is built.

Run the prototype with:

```sh
npm install
npm run dev
```

Quality checks:

```sh
npm run lint
npm run build
```
