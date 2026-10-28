import { useEffect, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { searchUsers } from './inaturalist'
import type { INatUser } from './inaturalist'

type Props = { value: string; onChange: (value: string) => void }
export function UsernameField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<INatUser[]>([])
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const query = value.slice(value.lastIndexOf(',') + 1).trim()
  useEffect(() => {
    setResults([])
    setActive(-1)
    setError('')
    if (!open || query.length < 2) {
      setBusy(false)
      return
    }
    const controller = new AbortController()
    setBusy(true)
    const timer = window.setTimeout(() => {
      void searchUsers(query, controller.signal)
        .then((users) => {
          if (!controller.signal.aborted) setResults(users)
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              'User search is unavailable. You can enter a username directly.',
            )
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  function select(user: INatUser) {
    // Preserve older links containing multiple users when changing their last entry.
    const prefix = value.slice(0, value.lastIndexOf(',') + 1)
    onChange(`${prefix}${user.login}`)
    setOpen(false)
    setResults([])
    setActive(-1)
  }
  const showResults = open && results.length > 0
  return (
    <div
      className="username-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <label htmlFor="username">Username</label>
      <div className="username-input">
        <Search size={16} aria-hidden="true" />
        <input
          id="username"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls="username-results"
          aria-activedescendant={
            showResults && active >= 0
              ? `username-option-${results[active].id}`
              : undefined
          }
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="Search iNaturalist users"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              return
            }
            if (!showResults) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((index) => (index + 1) % results.length)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((index) =>
                index <= 0 ? results.length - 1 : index - 1,
              )
            }
            if (event.key === 'Enter' && active >= 0) {
              event.preventDefault()
              select(results[active])
            }
          }}
        />
        {busy && open && (
          <LoaderCircle
            size={15}
            className="spin"
            aria-label="Searching users"
          />
        )}
      </div>
      {showResults && (
        <ul
          id="username-results"
          role="listbox"
          aria-label="Matching users"
          className="username-results"
        >
          {results.map((user, index) => (
            <li
              key={user.id}
              role="option"
              id={`username-option-${user.id}`}
              aria-selected={active === index}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(user)}
              onPointerMove={() => setActive(index)}
            >
              <strong>{user.login}</strong>
              {user.name && <span>{user.name}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && !busy && query.length >= 2 && !results.length && (
        <p className="hint" role="status">
          {error || 'No matching users.'}
        </p>
      )}
    </div>
  )
}
