import { GROUPS, groupFor } from './search.ts'
import type { View } from './search.ts'
import type { Species, TaxonAncestor } from './inaturalist.ts'

export type SpeciesGroup = {
  key: string
  label: string
  scientificName?: string
  species: Species[]
}
const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
export function sortSpecies(species: Species[], sort: View['sort']) {
  return [...species].sort((a, b) => {
    const primary =
      sort === 'frequency'
        ? b.count - a.count
        : alphabet.compare(
            sort === 'scientific' ? a.scientificName : a.commonName,
            sort === 'scientific' ? b.scientificName : b.commonName,
          )
    return (
      primary ||
      alphabet.compare(a.commonName, b.commonName) ||
      alphabet.compare(a.scientificName, b.scientificName) ||
      a.id - b.id
    )
  })
}
function groupingTaxon(
  species: Species,
  grouping: View['grouping'],
): TaxonAncestor | undefined {
  if (grouping === 'order') return species.order
  if (grouping === 'natural' && species.order?.name === 'Passeriformes')
    return species.order
  return species.family ?? species.order
}
export function groupSpecies(
  species: Species[],
  view: Pick<View, 'sort' | 'grouping'>,
): SpeciesGroup[] {
  if (view.grouping === 'none')
    return [{ key: 'all', label: '', species: sortSpecies(species, view.sort) }]
  const grouped = new Map<string, SpeciesGroup & { lifeGroup: number }>()
  for (const item of species) {
    const lifeGroup = groupFor(item.iconicTaxon)
    const taxon = groupingTaxon(item, view.grouping)
    const key = taxon ? `${taxon.rank}-${taxon.id}` : lifeGroup.key
    const group = grouped.get(key) ?? {
      key,
      label: taxon?.preferred_common_name ?? taxon?.name ?? lifeGroup.label,
      scientificName: taxon?.name,
      species: [],
      lifeGroup: GROUPS.indexOf(lifeGroup),
    }
    group.species.push(item)
    grouped.set(key, group)
  }
  return [...grouped.values()]
    .sort(
      (a, b) => a.lifeGroup - b.lifeGroup || alphabet.compare(a.label, b.label),
    )
    .map((group) => ({
      ...group,
      species: sortSpecies(group.species, view.sort),
    }))
}
