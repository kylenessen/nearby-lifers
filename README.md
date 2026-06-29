# Nearby Lifers

Nearby Lifers is a small field prototype for iNaturalist users. It builds a species snapshot for a place and highlights taxa that can add to a user profile species count.

The current prototype defaults to `kylenessen`, latitude `35.32763176091517`, longitude `-120.83909699047472`, and a `1 km` radius. It uses the current seasonal window, which is the previous month, current month, and next month. On June 29, 2026, that means May, June, and July.

The app queries iNaturalist species counts for the nearby area and also queries the user's global observed taxa. It then marks anything already observed anywhere in the world as done. Species that are not done appear as targets. During a hike, a target can be tapped to hide it from the current snapshot without uploading or syncing anything.

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
