import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MONTHS, PAPERS } from './search'
import { groupSpecies } from './presentation'
import { bookletPlan } from './booklet'
import { BookletBack, BookletParameters } from './BookletDetails'
import type { View } from './search'
import type { Snapshot, Species } from './inaturalist'
import { GROUP_COLORS, printGrid, packGrid, packList } from './print-layout'
import type { ListColumn } from './print-layout'
import './PrintPreview.css'

type Props = {
  snapshot: Snapshot
  species: Species[]
  view: View
  visible: boolean
  onBookletSheetsChange?: (sheets: number) => void
  onGridFitsChange?: (fits: boolean) => void
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
function PrintCard({
  species,
  label,
  groupKey,
  color,
  credits,
  visible,
}: {
  species: Species
  label?: string
  groupKey?: string
  color?: string
  credits: boolean
  visible: boolean
}) {
  return (
    <div
      className="print-card"
      data-species-id={species.id}
      data-group={groupKey}
    >
      {label && (
        <div className="print-card-group" style={{ backgroundColor: color }}>
          {label}
        </div>
      )}
      <div className="print-photo">
        {species.photoUrl && (
          <img
            src={species.photoUrl}
            alt=""
            loading={visible ? 'eager' : 'lazy'}
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden'
            }}
          />
        )}
      </div>
      <div className="print-names">
        <strong>{species.commonName}</strong>
        <i>{species.scientificName}</i>
      </div>
      <span
        className="print-records"
        title="Records in the selected area and months"
      >
        {species.count.toLocaleString()} records
      </span>
      {credits && (
        <small className="print-credit">
          {species.photoCredit ?? 'Photo unavailable'}
        </small>
      )}
    </div>
  )
}

export function PrintPreview({
  snapshot,
  species,
  view,
  visible,
  onBookletSheetsChange,
  onGridFitsChange,
}: Props) {
  const booklet = view.printMode === 'booklet'
  const paperKey = booklet ? 'half' : view.paper
  const paper = PAPERS[paperKey]
  const { columns, rows } = printGrid(view)
  const listColumns =
    paperKey === 'letter'
      ? ['compact', 'dense'].includes(view.density)
        ? 3
        : 2
      : ['compact', 'dense'].includes(view.density) && paperKey !== 'a6'
        ? 2
        : 1
  const contentsColumns = ['compact', 'dense'].includes(view.density) ? 2 : 1
  const measure = useRef<HTMLDivElement>(null)
  const gridMeasure = useRef<HTMLDivElement>(null)
  const contentsMeasure = useRef<HTMLDivElement>(null)
  const [packed, setPacked] = useState<ListColumn[]>([])
  const [contentsRows, setContentsRows] = useState<number[][]>([])
  const [gridPages, setGridPages] = useState<number[][]>([])
  const groups = useMemo(
    () => groupSpecies(species, { sort: view.sort, grouping: view.grouping }),
    [species, view.grouping, view.sort],
  )
  const groupLabels = useMemo(
    () => new Map(groups.map((group) => [group.key, group.label])),
    [groups],
  )
  const groupColors = useMemo(
    () =>
      new Map(
        groups.map((group, index) => [
          group.key,
          GROUP_COLORS[index % GROUP_COLORS.length],
        ]),
      ),
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
    '--grid-font': `${view.gridFontSize ?? 10}pt`,
    '--list-columns': listColumns,
    '--contents-columns': contentsColumns,
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
  }, [
    groups,
    speciesGroups,
    view.layout,
    paperKey,
    view.density,
    snapshot,
    booklet,
    view.bookletTitle,
  ])

  useLayoutEffect(() => {
    const element = gridMeasure.current
    if (!element || view.layout !== 'grid') return
    const cards = Array.from(
      element.querySelectorAll<HTMLElement>('.print-card'),
    )
    const body = element.querySelector('.sheet-body')!
    const capacity = body.getBoundingClientRect().height - 1
    const gap = parseFloat(getComputedStyle(body).rowGap)
    const items = cards.map((card) => ({
      id: Number(card.dataset.speciesId),
      height: card.getBoundingClientRect().height,
    }))
    setGridPages(packGrid(items, columns, rows, capacity, gap))
    onGridFitsChange?.(items.every((item) => item.height <= capacity))
  }, [
    orderedSpecies,
    groups,
    columns,
    rows,
    onGridFitsChange,
    paperKey,
    booklet,
    view.layout,
    view.density,
    view.gridFontSize,
    view.showPhotoCredits,
    view.bookletTitle,
    snapshot,
  ])

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
  }, [
    booklet,
    grouped,
    groups,
    contentsColumns,
    view.density,
    view.bookletTitle,
  ])

  const pages = gridPages.map((ids) =>
    ids.map((id) => byId.get(id)).filter((s): s is Species => Boolean(s)),
  )
  const listPages: ListColumn[][] = []
  for (let i = 0; i < packed.length; i += listColumns)
    listPages.push(packed.slice(i, i + listColumns))
  const pageCount = view.layout === 'grid' ? pages.length : listPages.length
  const contentsPages: number[][][] = []
  for (let i = 0; i < contentsRows.length; i += contentsColumns)
    contentsPages.push(contentsRows.slice(i, i + contentsColumns))
  const plan = bookletPlan(pageCount, grouped ? contentsPages.length : 0)
  useLayoutEffect(() => {
    onBookletSheetsChange?.(booklet ? plan.sheets : 0)
  }, [onBookletSheetsChange, booklet, plan.sheets])
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
      <span>
        {booklet
          ? view.bookletTitle.trim() || 'Nearby Lifers'
          : `iNaturalist records · ${date}`}
      </span>
      <span>{booklet ? number : `${number} / ${pageCount}`}</span>
    </footer>
  )
  const header = !booklet && (
    <Header snapshot={snapshot} count={species.length} view={view} />
  )
  const card = (s: Species) => (
    <PrintCard
      key={s.id}
      species={s}
      groupKey={speciesGroups.get(s.id)}
      label={grouped ? groupLabels.get(speciesGroups.get(s.id)!) : undefined}
      color={groupColors.get(speciesGroups.get(s.id)!)}
      credits={view.showPhotoCredits}
      visible={visible}
    />
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
            <div className="sheet-body print-grid">{page.map(card)}</div>
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
                      {group.ids
                        .filter((id) => byId.has(id))
                        .map((id) => (
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
            ? `${columns} columns · Up to ${rows} rows per page · ${view.gridFontSize ?? 10} pt · Square photos`
            : 'Grouped checklist'}
        </p>
      )}
      {view.layout === 'grid' && (
        <div className="print-measure" ref={gridMeasure} aria-hidden="true">
          <div className="print-sheet">
            {header}
            <div className="sheet-body print-grid">
              {orderedSpecies.map(card)}
            </div>
            {footer(booklet ? plan.contentStart : 1)}
          </div>
        </div>
      )}
      {booklet && grouped && (
        <div className="print-measure" ref={contentsMeasure} aria-hidden="true">
          <div className="print-sheet booklet-contents">
            <h2 className="booklet-page-title">Contents</h2>
            <div className="sheet-body">
              <div className="contents-measure-column">
                {groups.map((group) => (
                  <div className="contents-entry" key={group.key}>
                    <span>{group.label}</span>
                    <span className="contents-dots" />
                    <strong>8888</strong>
                  </div>
                ))}
              </div>
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
                          <div className="sheet-body contents-columns">
                            {contentsPages[page.contentsIndex]?.map(
                              (column, colIndex) => (
                                <div key={colIndex}>
                                  {column.map((index) => (
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
                              ),
                            )}
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
