import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MONTHS, PAPERS } from './search'
import { groupSpecies } from './presentation'
import { bookletPlan } from './booklet'
import { BookletBack, BookletParameters } from './BookletDetails'
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
  const contentsMeasure = useRef<HTMLDivElement>(null)
  const [packed, setPacked] = useState<ListColumn[]>([])
  const [contentsRows, setContentsRows] = useState<number[][]>([])
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
  const orderedSpecies = useMemo(
    () => groups.flatMap((g) => g.species),
    [groups],
  )
  const grouped = view.grouping !== 'none'
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

  useLayoutEffect(() => {
    const element = contentsMeasure.current
    if (!element || !booklet || !grouped) return
    const capacity =
      element.querySelector('.sheet-body')!.getBoundingClientRect().height - 2
    const rows = Array.from(
      element.querySelectorAll<HTMLElement>('.contents-entry'),
    ).map((row, id) => ({
      id,
      group: 'contents',
      height: row.getBoundingClientRect().height,
    }))
    setContentsRows(
      packList(rows, capacity, 0).map((column) => column.flatMap((g) => g.ids)),
    )
  }, [booklet, grouped, groups])

  const pages: Species[][] = []
  for (let i = 0; i < orderedSpecies.length; i += columns * rows)
    pages.push(orderedSpecies.slice(i, i + columns * rows))
  const listPages: ListColumn[][] = []
  for (let i = 0; i < packed.length; i += listColumns)
    listPages.push(packed.slice(i, i + listColumns))
  const pageCount = view.layout === 'grid' ? pages.length : listPages.length
  const plan = bookletPlan(pageCount, grouped ? contentsRows.length : 0)
  const groupFirstPage = new Map<string, number>()
  if (view.layout === 'grid') {
    pages.forEach((page, index) =>
      page.forEach((s) => {
        const key = speciesGroups.get(s.id)!
        if (!groupFirstPage.has(key))
          groupFirstPage.set(key, plan.contentStart + index)
      }),
    )
  } else {
    listPages.forEach((page, index) =>
      page.forEach((column) =>
        column.forEach((g) => {
          if (!groupFirstPage.has(g.group))
            groupFirstPage.set(g.group, plan.contentStart + index)
        }),
      ),
    )
  }
  const date = new Date(snapshot.builtAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const footer = (number: number) => (
    <footer className="sheet-footer">
      <span>iNaturalist records · {date}</span>
      <span>
        {number} / {booklet ? plan.totalPages : pageCount}
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
                <div
                  className="print-card"
                  data-species-id={s.id}
                  data-group={speciesGroups.get(s.id)}
                  key={s.id}
                >
                  {grouped && (
                    <div className="print-card-group">
                      {groupLabels.get(speciesGroups.get(s.id)!)}
                    </div>
                  )}
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
                  <span className="print-records">
                    {s.count.toLocaleString()} records
                  </span>
                  <small className="print-credit">
                    {s.photoCredit ?? 'Photo unavailable'}
                  </small>
                </div>
              ))}
            </div>
            {footer(booklet ? plan.contentStart + index : index + 1)}
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
                    <section key={i} data-group={group.group}>
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
            {footer(booklet ? plan.contentStart + index : index + 1)}
          </article>
        ))

  return (
    <section
      className={`print-output ${visible ? 'preview-visible' : ''} density-${view.density} paper-${paperKey} ${booklet ? 'booklet-output' : ''} ${grouped ? 'print-grouped' : ''}`}
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
      {booklet && grouped && (
        <div className="print-measure" ref={contentsMeasure} aria-hidden="true">
          <div className="print-sheet booklet-contents">
            <h2 className="booklet-page-title">Contents</h2>
            <div className="sheet-body">
              {groups.map((group) => (
                <div className="contents-entry" key={group.key}>
                  <span>{group.label}</span>
                  <span className="contents-dots" />
                  <strong>8888</strong>
                </div>
              ))}
            </div>
            {footer(3)}
          </div>
        </div>
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
                      ) : page.kind === 'parameters' ? (
                        <article className="print-sheet booklet-parameters-page">
                          <BookletParameters
                            snapshot={snapshot}
                            view={view}
                            count={species.length}
                          />
                          {footer(page.number)}
                        </article>
                      ) : page.kind === 'contents' ? (
                        <article className="print-sheet booklet-contents">
                          <h2 className="booklet-page-title">
                            Contents{page.contentsIndex > 0 ? ' continued' : ''}
                          </h2>
                          <div className="sheet-body">
                            {contentsRows[page.contentsIndex]?.map((index) => (
                              <div
                                className="contents-entry"
                                data-group={groups[index].key}
                                key={groups[index].key}
                              >
                                <span>{groups[index].label}</span>
                                <span className="contents-dots" />
                                <strong>
                                  {groupFirstPage.get(groups[index].key)}
                                </strong>
                              </div>
                            ))}
                          </div>
                          {footer(page.number)}
                        </article>
                      ) : (
                        <article
                          className={`print-sheet ${page.kind === 'cover' ? 'booklet-cover' : page.kind === 'back-cover' ? 'booklet-back' : 'booklet-blank'}`}
                        >
                          {page.kind === 'cover' ? (
                            <>
                              <p className="booklet-owner">
                                {snapshot.users
                                  .map((user) => `@${user.login}`)
                                  .join(', ')}
                              </p>
                              <h1>
                                {view.bookletTitle.trim() || 'Nearby Lifers'}
                              </h1>
                              {view.bookletTitle.trim() &&
                                view.bookletTitle.trim() !==
                                  'Nearby Lifers' && (
                                  <p className="booklet-tool-name">
                                    Nearby Lifers
                                  </p>
                                )}
                              <p>{snapshot.areaLabel}</p>
                              <p className="booklet-date">Generated {date}</p>
                            </>
                          ) : page.kind === 'back-cover' ? (
                            <BookletBack />
                          ) : (
                            <span className="blank-page-label screen-only">
                              Blank page
                            </span>
                          )}
                        </article>
                      )}
                    </div>
                  ))}
                  <svg
                    className="staple-guides"
                    viewBox="0 0 2 215.9"
                    aria-hidden="true"
                  >
                    {[38.1, 107.95, 177.8].map((center) => (
                      <g
                        className="staple-guide"
                        key={center}
                        stroke="#777"
                        strokeWidth="0.2"
                        fill="none"
                      >
                        <path
                          d={`M1 ${center - 6.35}v12.7`}
                          strokeDasharray="0.8 0.7"
                        />
                        <path
                          d={`M0.5 ${center - 6.35}h1M0.5 ${center + 6.35}h1`}
                        />
                      </g>
                    ))}
                  </svg>
                </div>
              </section>
            ))
          : contentPages}
      </div>
    </section>
  )
}
