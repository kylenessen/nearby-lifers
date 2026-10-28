import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MONTHS, PAPERS } from './search'
import { groupSpecies } from './presentation'
import { bookletPlan } from './booklet'
import type { View } from './search'
import type { Snapshot, Species } from './inaturalist'
import { gridShape, packList } from './print-layout'
import type { ListColumn } from './print-layout'
import './PrintPreview.css'

type Props = {
  snapshot: Snapshot
  species: Species[]
  view: View
  visible: boolean
}
function Header({
  snapshot,
  count,
  view,
}: {
  snapshot: Snapshot
  count: number
  view: View
}) {
  return (
    <header className="sheet-header">
      <div>
        <strong>Nearby Lifers</strong>
        <span>
          {count} species ·{' '}
          {view.showObserved ? 'Including observed species' : 'Field checklist'}
        </span>
      </div>
      <p>
        {snapshot.users.map((u) => u.login).join(', ')} · {snapshot.areaLabel}
      </p>
      <p>
        {snapshot.search.months
          .slice()
          .sort((a, b) => a - b)
          .map((m) => MONTHS[m - 1])
          .join(', ')}{' '}
        ·{' '}
        {snapshot.search.excludeUserCasual
          ? 'Life list excludes casual'
          : 'Life list includes all quality grades'}
        {view.hideCasual ? ' · No casual-only targets' : ''}
        {view.hideUnexpected ? ' · Expected nearby' : ''}
      </p>
    </header>
  )
}
function Row({ species }: { species: Species }) {
  return (
    <div className="print-list-row" data-species-id={species.id}>
      <span className="paper-checkbox">
        {species.observedByUser ? '✓' : ''}
      </span>
      <div>
        <strong>{species.commonName}</strong>
        <i>{species.scientificName}</i>
      </div>
    </div>
  )
}
export function PrintPreview({ snapshot, species, view, visible }: Props) {
  const booklet = view.printMode === 'booklet'
  const paperKey = booklet ? 'half' : view.paper
  const paper = PAPERS[paperKey]
  const { columns, rows } = gridShape(paperKey, view.density)
  const listColumns =
    paperKey === 'letter'
      ? ['compact', 'dense'].includes(view.density)
        ? 3
        : 2
      : ['compact', 'dense'].includes(view.density) && paperKey !== 'a6'
        ? 2
        : 1
  const measure = useRef<HTMLDivElement>(null)
  const [packed, setPacked] = useState<ListColumn[]>([])
  const groups = useMemo(
    () => groupSpecies(species, { sort: view.sort, grouping: view.grouping }),
    [species, view.grouping, view.sort],
  )
  const groupLabels = useMemo(
    () => new Map(groups.map((group) => [group.key, group.label])),
    [groups],
  )
  const speciesGroups = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.species.map((item) => [item.id, group.key] as const),
        ),
      ),
    [groups],
  )
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species])
  const style = {
    '--paper-width': `${paper.width}mm`,
    '--paper-height': `${paper.height}mm`,
    '--print-columns': columns,
    '--print-rows': rows,
    '--list-columns': listColumns,
  } as CSSProperties

  useLayoutEffect(() => {
    const element = measure.current
    if (!element || view.layout !== 'list') return
    const capacity =
      element.querySelector('.sheet-body')!.getBoundingClientRect().height - 2
    const headings = new Map(
      Array.from(
        element.querySelectorAll<HTMLElement>('.print-group-heading'),
      ).map((heading) => [
        heading.dataset.groupKey!,
        heading.getBoundingClientRect().height,
      ]),
    )
    const items = Array.from(
      element.querySelectorAll<HTMLElement>('.print-list-row'),
    ).map((row) => ({
      id: Number(row.dataset.speciesId),
      group: speciesGroups.get(Number(row.dataset.speciesId))!,
      height: row.getBoundingClientRect().height,
    }))
    setPacked(packList(items, capacity, headings))
  }, [groups, speciesGroups, view.layout, paperKey, view.density, snapshot])

  const pages: Species[][] = []
  for (let i = 0; i < species.length; i += columns * rows)
    pages.push(species.slice(i, i + columns * rows))
  const listPages: ListColumn[][] = []
  for (let i = 0; i < packed.length; i += listColumns)
    listPages.push(packed.slice(i, i + listColumns))
  const pageCount = view.layout === 'grid' ? pages.length : listPages.length
  const plan = bookletPlan(pageCount)
  const date = new Date(snapshot.builtAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const footer = (index: number) => (
    <footer className="sheet-footer">
      <span>iNaturalist records · {date}</span>
      <span>
        {booklet ? index + 2 : index + 1} /{' '}
        {booklet ? plan.totalPages : pageCount}
      </span>
    </footer>
  )
  const header = (
    <Header snapshot={snapshot} count={species.length} view={view} />
  )

  const contentPages =
    view.layout === 'grid'
      ? pages.map((page, index) => (
          <article
            className="print-sheet"
            data-content-index={index}
            key={index}
          >
            {header}
            <div className="sheet-body print-grid">
              {page.map((s) => (
                <div className="print-card" data-species-id={s.id} key={s.id}>
                  <div className="print-photo">
                    {s.photoUrl && (
                      <img
                        src={s.photoUrl}
                        alt=""
                        loading={visible ? 'eager' : 'lazy'}
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    )}
                    <span className="paper-checkbox">
                      {s.observedByUser ? '✓' : ''}
                    </span>
                  </div>
                  <div className="print-names">
                    <strong>{s.commonName}</strong>
                    <i>{s.scientificName}</i>
                  </div>
                  <small className="print-credit">
                    {s.photoCredit ?? 'Photo unavailable'}
                  </small>
                </div>
              ))}
            </div>
            {footer(index)}
          </article>
        ))
      : listPages.map((page, index) => (
          <article
            className="print-sheet"
            data-content-index={index}
            key={index}
          >
            {header}
            <div className="sheet-body print-list-columns">
              {page.map((column, columnIndex) => (
                <div className="print-list-column" key={columnIndex}>
                  {column.map((group, i) => (
                    <section key={i}>
                      {groupLabels.get(group.group) && (
                        <h3 className="print-group-heading">
                          {groupLabels.get(group.group)}
                        </h3>
                      )}
                      {group.ids.map((id) => (
                        <Row key={id} species={byId.get(id)!} />
                      ))}
                    </section>
                  ))}
                </div>
              ))}
            </div>
            {footer(index)}
          </article>
        ))

  return (
    <section
      className={`print-output ${visible ? 'preview-visible' : ''} density-${view.density} paper-${paperKey} ${booklet ? 'booklet-output' : ''}`}
      style={style}
      aria-label="Printable field sheets"
      aria-hidden={!visible}
    >
      <style>{`@page { size: ${booklet ? 279.4 : paper.width}mm ${booklet ? 215.9 : paper.height}mm; margin: 0; }`}</style>
      {visible && (
        <p className="preview-caption screen-only">
          {booklet
            ? `Letter booklet · ${plan.sheets} sheets · ${plan.totalPages} folded pages`
            : `${paper.label} · ${paper.dimensions} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}{' '}
          ·{' '}
          {view.layout === 'grid'
            ? `${columns} × ${rows} photo grid`
            : 'Grouped checklist'}
        </p>
      )}
      {view.layout === 'list' && (
        <div className="print-measure" ref={measure} aria-hidden="true">
          <div className="print-sheet">
            {header}
            <div className="sheet-body">
              <div className="measure-column">
                {groups.map((group) => (
                  <section key={group.key}>
                    {group.label && (
                      <h3
                        className="print-group-heading"
                        data-group-key={group.key}
                      >
                        {group.label}
                      </h3>
                    )}
                    {group.species.map((s) => (
                      <Row key={s.id} species={s} />
                    ))}
                  </section>
                ))}
              </div>
            </div>
            {footer(0)}
          </div>
        </div>
      )}
      <div className={`sheet-stack ${booklet ? 'booklet-stack' : ''}`}>
        {booklet
          ? plan.sides.map((side) => (
              <section
                className="booklet-sheet-wrapper"
                key={`${side.sheet}-${side.side}`}
              >
                <p className="booklet-side-label screen-only">
                  Sheet {side.sheet} ·{' '}
                  {side.side === 'front' ? 'Front' : 'Back'} · Pages{' '}
                  {side.pages.map((p) => p.number).join(' and ')}
                </p>
                <div
                  className="booklet-side"
                  data-sheet={side.sheet}
                  data-side={side.side}
                >
                  {side.pages.map((page) => (
                    <div
                      className="booklet-slot"
                      key={page.number}
                      data-page-number={page.number}
                      data-page-kind={page.kind}
                    >
                      {page.kind === 'content' ? (
                        contentPages[page.contentIndex]
                      ) : (
                        <article
                          className={`print-sheet ${page.kind === 'cover' ? 'booklet-cover' : 'booklet-blank'}`}
                        >
                          {page.kind === 'cover' ? (
                            <>
                              <h1>
                                {view.bookletTitle.trim() || 'Nearby Lifers'}
                              </h1>
                              <p>{snapshot.areaLabel}</p>
                              <p>
                                {snapshot.users
                                  .map((user) => user.login)
                                  .join(', ')}
                              </p>
                            </>
                          ) : (
                            <span className="blank-page-label screen-only">
                              {page.kind === 'back-cover'
                                ? 'Blank back cover'
                                : 'Blank page'}
                            </span>
                          )}
                        </article>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          : contentPages}
      </div>
    </section>
  )
}
