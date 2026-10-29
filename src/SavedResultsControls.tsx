import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from './inaturalist'
import {
  clearSavedResults,
  removeSavedResults,
  saveResults,
} from './saved-results'
import { offlineReady, removeOfflinePhotos, saveOffline } from './offline'
import { useOnline } from './network'

export function SavedResultsControls({
  snapshot,
  saved,
  busy,
  storageMessage,
  onSavedChange,
  onRefresh,
}: {
  snapshot: Snapshot
  saved: boolean
  busy: boolean
  storageMessage: string
  onSavedChange: (saved: boolean) => void
  onRefresh: () => void
}) {
  const online = useOnline()
  const [ready, setReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState('')
  const [protectedStorage, setProtectedStorage] = useState(false)
  const [removing, setRemoving] = useState(false)
  const download = useRef<AbortController | null>(null)
  useEffect(() => {
    let alive = true
    void offlineReady(snapshot)
      .then((value) => {
        if (alive) setReady(value)
      })
      .catch(() => {})
    void navigator.storage
      ?.persisted?.()
      .then((value) => {
        if (alive) setProtectedStorage(value)
      })
      .catch(() => {})
    return () => {
      alive = false
      download.current?.abort()
    }
  }, [snapshot])
  const disabled = busy || downloading || removing
  async function save() {
    const controller = new AbortController()
    download.current = controller
    setDownloading(true)
    setMessage('Saving this search for offline use.')
    try {
      // This user gesture may let the browser protect saved data from eviction.
      const protectedData = await navigator.storage
        ?.persist?.()
        .catch(() => false)
      if (protectedData) setProtectedStorage(true)
      controller.signal.throwIfAborted()
      await saveResults(snapshot, controller.signal)
      onSavedChange(true)
      await saveOffline(snapshot, controller.signal, setMessage)
      controller.signal.throwIfAborted()
      setReady(true)
      setMessage(
        'Offline download complete. This search and its photos can now reopen without a connection.',
      )
    } catch (cause) {
      if (!controller.signal.aborted)
        setMessage(
          cause instanceof Error
            ? cause.message
            : 'Offline saving failed. Please try again.',
        )
    } finally {
      if (!controller.signal.aborted) setDownloading(false)
    }
  }
  async function remove(all = false) {
    setRemoving(true)
    try {
      if (all) await clearSavedResults()
      else await removeSavedResults(snapshot.search)
      onSavedChange(false)
      setReady(false)
      await removeOfflinePhotos(all ? undefined : snapshot)
      setMessage(
        all
          ? 'All saved searches and photos removed from this device. Current results remain open.'
          : 'Saved copy and photos removed. Current results remain open. The next visit will rebuild this search.',
      )
    } catch {
      setMessage('Could not remove all saved data. Please try again.')
    } finally {
      setRemoving(false)
    }
  }
  return (
    <section className="saved-results" aria-label="Saved search">
      <p>
        Results collected{' '}
        <time dateTime={snapshot.builtAt}>
          {new Date(snapshot.builtAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </time>
        .
      </p>
      <p>
        {saved
          ? 'Saved on this device until you choose Refresh.'
          : 'Results are not saved on this device.'}{' '}
        {ready && saved
          ? 'Ready for offline use.'
          : 'Photos are not fully saved for offline use.'}
      </p>
      {!online && (
        <p role="status">
          You are offline. Saved results and print layouts are available. New
          searches, satellite imagery, and external links need internet access.
        </p>
      )}
      <div className="saved-actions">
        <button
          type="button"
          disabled={disabled || !online}
          onClick={onRefresh}
        >
          Refresh results
        </button>
        <button
          type="button"
          disabled={disabled || !online || (ready && saved)}
          onClick={save}
        >
          {downloading
            ? 'Saving offline'
            : ready && saved
              ? 'Saved for offline'
              : 'Save for offline'}
        </button>
        {downloading && (
          <button
            type="button"
            onClick={() => {
              download.current?.abort()
              setDownloading(false)
              setMessage(
                'Download canceled. Results are saved. Some photos may still need downloading.',
              )
            }}
          >
            Cancel download
          </button>
        )}
      </div>
      {(message || storageMessage) && (
        <p role="status">{message || storageMessage}</p>
      )}
      <details>
        <summary>Device storage</summary>
        <p>
          Search settings stay in the link. Results never expire automatically.
          Refresh updates the life list and nearby records. Save for offline
          again after refreshing to download any new photos.
        </p>
        <p>
          {protectedStorage
            ? 'This browser has granted persistent storage.'
            : 'The browser has not granted persistent storage and may remove saved data when space is needed.'}{' '}
          Clearing site data or ending a private browsing session can remove
          saved searches. Satellite imagery is not downloaded. The search
          boundary remains available offline.
        </p>
        <div className="saved-actions">
          <button
            type="button"
            disabled={disabled || !saved}
            onClick={() => void remove()}
          >
            Remove saved copy
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void remove(true)}
          >
            Clear all saved searches
          </button>
        </div>
      </details>
    </section>
  )
}
