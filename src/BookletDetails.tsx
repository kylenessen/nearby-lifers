import { GROUPS, MONTHS } from './search'
import type { View } from './search'
import type { Snapshot } from './inaturalist'
import { PUBLIC_SITE_URL, qrGraphic } from './qr'
import { PrintMap } from './PrintMap'
import { printGrid } from './print-layout'

const websiteQr = qrGraphic(PUBLIC_SITE_URL)
function QrImage({
  graphic,
  className,
  label,
}: {
  graphic: ReturnType<typeof qrGraphic>
  className: string
  label: string
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${graphic.size} ${graphic.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={graphic.size} height={graphic.size} fill="white" />
      <path d={graphic.path} fill="black" />
    </svg>
  )
}
export function BookletBack() {
  return (
    <div className="booklet-credit">
      <a href={PUBLIC_SITE_URL} aria-label="Open Nearby Lifers website">
        <QrImage
          graphic={websiteQr}
          className="booklet-qr"
          label="QR code for Nearby Lifers"
        />
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
          : `Polygon with ${area.points.length} corners. Boundary shown above.`
  const parameters = [
    [
      'Generated on',
      new Date(snapshot.builtAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    ],
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
      `${view.layout === 'grid' ? `${printGrid(view).columns} columns, up to ${printGrid(view).rows} rows. ${view.gridFontSize ?? 9} pt. Photos cropped to fill, credits ${view.showPhotoCredits ? 'shown' : 'hidden'}` : `Checklist. ${{ comfortable: 'Comfortable', compact: 'Compact', dense: 'Extra compact', large: 'Large' }[view.density]}`}. ${count} species. Letter folded to 5.5 × 8.5 in.`,
    ],
  ]
  return (
    <>
      <PrintMap snapshot={snapshot} />
      <dl className="booklet-parameters">
        {parameters.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
