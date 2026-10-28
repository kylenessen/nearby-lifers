import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EBIRD_DATASET, exactTaxonMatch, fetchGbifCounts, gbifArea, geometryWkt, loadGbif, mergeSourceCounts } from '../src/gbif.ts'
import { defaults, encodeSettings, decodeSettings, searchKey } from '../src/search.ts'
import { buildSnapshot } from '../src/inaturalist.ts'
import type { Species } from '../src/inaturalist.ts'

test('source selection round trips, changes the search key, and rejects unknown sources', () => {
  const settings = defaults()
  const original = searchKey(settings.search)
  for (const source of ['inaturalist', 'ebird', 'gbif'] as const) {
    settings.search.source = source
    assert.equal(decodeSettings(encodeSettings(settings)).search.source, source)
    if (source !== 'inaturalist') assert.notEqual(searchKey(settings.search), original)
  }
  assert.equal(decodeSettings('?users=test').search.source, 'inaturalist')
  assert.throws(() => decodeSettings('?source=invalid'), /supported record source/)
})
test('GBIF areas preserve circles, rectangles, polygon holes and orientation', () => {
  const search = defaults().search
  assert.equal(gbifArea(search).params.get('geoDistance'), '35.327632,-120.839097,1km')
  search.area = { kind: 'rectangle', bounds: { sw: {lat: 1, lng: 2}, ne: {lat: 3, lng: 4} } }
  assert.equal(gbifArea(search).params.get('decimalLongitude'), '2,4')
  const ring = [[0,0],[0,4],[4,4],[4,0],[0,0]]
  const hole = [[1,1],[2,1],[2,2],[1,2],[1,1]]
  assert.equal(geometryWkt({type:'Polygon', coordinates:[ring,hole]}), 'POLYGON((4 0,4 4,0 4,0 0,4 0),(1 2,2 2,2 1,1 1,1 2))')
  search.area = {kind:'polygon', points:ring.slice(0,-1).map(([lng,lat])=>({lat,lng}))}
  assert.equal(gbifArea(search).warnings.length, 0)
  assert.ok(gbifArea(search).params.get('geometry')!.startsWith('POLYGON'))
  search.area = {kind:'place', id:1}
  assert.throws(()=>gbifArea(search), /no polygon boundary/)
  const detailed = Array.from({length:2000}, (_,i)=>[2+Math.cos(i*Math.PI/1000),2+Math.sin(i*Math.PI/1000)])
  const place = {id:1,name:'Detailed',geometry_geojson:{type:'Polygon',coordinates:[[...detailed,detailed[0]]]}}
  const area = gbifArea(search, place)
  assert.match(area.warnings[0], /simplified place outline/)
  assert.ok(encodeURIComponent(area.params.get('geometry')!).length <= 6500)
  assert.equal(place.geometry_geojson.coordinates[0].length, 2001)
})
test('facets page through server caps, retain filters, and cache complete responses', async t => {
  const seen: URL[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const u = new URL(url); seen.push(u)
    const offset=Number(u.searchParams.get('facetOffset'))
    const rows=offset===0?[{name:'1',count:7},{name:'2',count:3}]:offset===2?[{name:'3',count:1}]:[]
    return Response.json({count:12,facets:[{field:'SPECIES_KEY',counts:rows}]})
  })
  const params=new URLSearchParams({datasetKey:EBIRD_DATASET,month:'9',geoDistance:'1,2,3km'})
  params.append('month','10')
  const result=await fetchGbifCounts(params)
  assert.deepEqual([...result.counts],[[1,7],[2,3],[3,1]])
  assert.equal(result.higherRankRecords,1)
  assert.deepEqual(seen.map(u=>u.searchParams.get('facetOffset')),['0','2','3'])
  assert.ok(seen.every(u=>u.searchParams.get('limit')==='0' && u.searchParams.get('datasetKey')===EBIRD_DATASET))
  assert.deepEqual(seen[0].searchParams.getAll('month'),['9','10'])
  await fetchGbifCounts(params)
  assert.equal(seen.length,3)
})
test('repeating facet pages fail instead of producing duplicate counts', async t => {
  t.mock.method(globalThis, 'fetch', async ()=>Response.json({count:2,facets:[{field:'SPECIES_KEY',counts:[{name:'1',count:1}]}]}))
  await assert.rejects(()=>fetchGbifCounts(new URLSearchParams({month:'12'})), /inconsistent species pages/)
})
test('matching requires a unique species name or exact synonym in the right life group', () => {
  const gbif={key:1,canonicalName:'Corvus brachyrhynchos',rank:'SPECIES',class:'Aves'}
  const taxon={id:1,name:gbif.canonicalName,rank_level:10,iconic_taxon_name:'Aves'}
  assert.equal(exactTaxonMatch([taxon],gbif)?.id,1)
  assert.equal(exactTaxonMatch([{...taxon,name:'Corvus renamed',matched_term:gbif.canonicalName}],gbif)?.id,1)
  assert.equal(exactTaxonMatch([{...taxon,rank_level:20}],gbif),undefined)
  assert.equal(exactTaxonMatch([{...taxon,iconic_taxon_name:'Plantae'}],gbif),undefined)
  assert.equal(exactTaxonMatch([taxon,{...taxon,id:2}],gbif),undefined)
  assert.equal(exactTaxonMatch([{...taxon,is_active:false}],gbif),undefined)
})
test('overlapping source counts are not added, but disjoint GBIF taxon buckets can merge', () => {
  const species: Species={id:1,commonName:'Bird',scientificName:'Bird species',count:10,casualOnly:false,expectedNearby:true,observedByUser:true,photoUrl:'inat.jpg'}
  const result=mergeSourceCounts([species],[{species,count:12},{species,count:3}], 'GBIF')
  assert.equal(result.length,1)
  assert.equal(result[0].count,15)
  assert.equal(result[0].inatCount,10)
  assert.equal(result[0].externalCount,15)
  assert.equal(result[0].observedByUser,true)
  assert.equal(result[0].photoUrl,'inat.jpg')
  assert.equal(species.count,10)
})
test('combined searches preserve iNaturalist life lists and photos and expose unmatched GBIF taxa', async t => {
  const requests: URL[]=[]
  const taxa=[
    {id:11,name:'Corvus brachyrhynchos',rank_level:10,iconic_taxon_name:'Aves',ancestors:[],default_photo:{medium_url:'inat-crow.jpg'}},
    {id:12,name:'Bucephala albeola',rank_level:10,iconic_taxon_name:'Aves',ancestors:[],default_photo:{medium_url:'inat-duck.jpg'}},
  ]
  t.mock.method(globalThis, 'fetch', async (url: string)=>{
    const u=new URL(url);requests.push(u)
    if(u.hostname==='api.inaturalist.org') {
      if(u.pathname.includes('/users/'))return Response.json({results:[{id:99,login:'tester'}]})
      if(u.pathname==='/v1/taxa')return Response.json({results:[]})
      const results=u.searchParams.has('user_id')?[{taxon:taxa[0],count:1}]:[{taxon:taxa[1],count:8}]
      return Response.json({total_results:results.length,results})
    }
    if(u.pathname.endsWith('/species/match'))return Response.json({usageKey:212,matchType:'EXACT'})
    if(u.pathname.endsWith('/occurrence/search'))return Response.json({count:35,facets:[{field:'SPECIES_KEY',counts:u.searchParams.get('facetOffset')==='0'?[{name:'901',count:20},{name:'902',count:10},{name:'903',count:5}]:[]}]})
    const key=Number(u.pathname.split('/').pop())
    return Response.json({key,canonicalName:key===901?taxa[0].name:key===902?taxa[1].name:'Unmatched bird',rank:'SPECIES',class:'Aves'})
  })
  const search=defaults().search
  search.users='tester';search.source='ebird';search.groups=['birds'];search.months=[11];search.excludeUserCasual=true
  const result=await buildSnapshot(search,'Test area')
  assert.equal(result.species.length,2)
  assert.equal(result.species.find(s=>s.id===11)!.observedByUser,true)
  assert.equal(result.species.find(s=>s.id===12)!.count,10)
  assert.equal(result.species.find(s=>s.id===12)!.photoUrl,'inat-duck.jpg')
  assert.deepEqual(result.external!.unmatched,[{key:903,name:'Unmatched bird',count:5}])
  const lifeList=requests.find(u=>u.searchParams.has('user_id'))!
  assert.equal(lifeList.searchParams.get('quality_grade'),'research,needs_id')
  assert.equal(lifeList.searchParams.has('month'),false)
  assert.ok(requests.filter(u=>u.pathname.endsWith('/occurrence/search')).every(u=>u.searchParams.get('datasetKey')===EBIRD_DATASET))
  const before=requests.length
  await loadGbif({...search,source:'gbif'},undefined)
  assert.ok(requests.slice(before).filter(u=>u.pathname.endsWith('/occurrence/search')).every(u=>!u.searchParams.has('datasetKey')))
})
