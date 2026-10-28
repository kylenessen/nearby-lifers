import { encodeSettings, GROUPS, MONTHS } from './search'
import type { View } from './search'
import type { Snapshot } from './inaturalist'
import { PUBLIC_SITE_URL, qrGraphic } from './qr'
import { PrintMap } from './PrintMap'

const websiteQr = qrGraphic(PUBLIC_SITE_URL)
export function BookletBack() {
  return (
    <div className="booklet-credit">
      <a href={PUBLIC_SITE_URL} aria-label="Open Nearby Lifers website">
        <svg
          className="booklet-qr"
          viewBox={`0 0 ${websiteQr.size} ${websiteQr.size}`}
          role="img"
          aria-label="QR code for Nearby Lifers"
          shapeRendering="crispEdges"
        >
          <rect width={websiteQr.size} height={websiteQr.size} fill="white" />
          <path d={websiteQr.path} fill="black" />
        </svg>
      </a>
      <p>Generated with the Nearby Lifers tool</p>
      <a href={PUBLIC_SITE_URL}>kylenessen.github.io/nearby-lifers</a>
    </div>
  )
}

export function BookletParameters({
  snapshot,
  view,
  count,
}: {
  snapshot: Snapshot
  view: View
  count: number
}) {
  const { search } = snapshot
  const { area } = search
  const areaDetails =
    area.kind === 'circle'
      ? `${search.radius} km radius around ${area.center.lat}, ${area.center.lng}`
      : area.kind === 'rectangle'
        ? `Rectangle from ${area.bounds.sw.lat}, ${area.bounds.sw.lng} to ${area.bounds.ne.lat}, ${area.bounds.ne.lng}`
        : area.kind === 'place'
          ? `iNaturalist place ${area.id}`
          : `Polygon with ${area.points.length} corners. The exact boundary is saved in the search link.`
  const parameters = [
    ['Username', snapshot.users.map((u) => `@${u.login}`).join(', ')],
    ['Area', `${snapshot.areaLabel}. ${areaDetails}`],
    [
      'Months',
      `${search.months
        .slice()
        .sort((a, b) => a - b)
        .map((m) => MONTHS[m - 1])
        .join(', ')}. All years.`,
    ],
    [
      'Life groups',
      GROUPS.filter((g) => search.groups.includes(g.key))
        .map((g) => g.label)
        .join(', '),
    ],
    [
      'Life list',
      `All dates and locations. Research Grade and Needs ID${search.excludeUserCasual ? '. Casual excluded.' : ' and Casual.'}`,
    ],
    [
      'Nearby filters',
      `${view.hideCasual ? 'Casual-only species hidden' : 'Casual-only species included'}. ${view.hideUnexpected ? 'Expected nearby only' : 'Any expected range'}.`,
    ],
    [
      'Already observed',
      view.showObserved ? 'Included and checked' : 'Excluded',
    ],
    [
      'Grouping',
      {
        natural: 'Taxonomic groups',
        family: 'Families',
        order: 'Orders',
        none: 'None',
      }[view.grouping],
    ],
    [
      'Sort order',
      `${{ frequency: 'Most records first', common: 'Common name', scientific: 'Scientific name' }[view.sort]}${view.grouping === 'none' ? '' : ' within each group'}`,
    ],
    [
      'Format',
      `${view.layout === 'grid' ? `Square photos, credits ${view.showPhotoCredits ? 'shown' : 'hidden'}` : 'Checklist'}. ${{ comfortable: 'Comfortable', compact: 'Compact', dense: 'Extra compact', large: 'Large' }[view.density]}. ${count} species. Letter folded to 5.5 × 8.5 in.`,
    ],
  ]
  return (
    <>
      <h2 className="booklet-page-title">This search</h2>
      <PrintMap snapshot={snapshot} />
      <dl className="booklet-parameters">
        {parameters.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <a
        className="booklet-search-link"
        href={`${PUBLIC_SITE_URL}?${encodeSettings({ search, view })}`}
      >
        Reopen this exact search
      </a>
    </>
  )
}
