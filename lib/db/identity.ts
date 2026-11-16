// Helpers that tie logged-in users and file paths to the right firm.

// Builds the database login token fields for a signed-in user.
export function jwtClaimsForUser(userId: string): string {
  if (!userId || typeof userId !== 'string') {
    throw new Error('jwtClaimsForUser requires a verified user id')
  }
  return JSON.stringify({
    sub: userId,
    role: 'authenticated',
  })
}

// Makes sure a stored file key stays inside that firm's folder.
export function assertFirmStorageKey(firmId: string, key: string): void {
  if (!firmId || !key) {
    throw new Error('Missing firm id or storage key')
  }
  const prefix = `${firmId}/`
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Invalid storage key')
  }
  if (!key.startsWith(prefix)) {
    throw new Error('Storage key escapes firm prefix')
  }
}

// Makes sure a stored file key stays inside that client's folder.
export function assertClientStorageKey(
  firmId: string,
  clientId: string,
  key: string
): void {
  assertFirmStorageKey(firmId, key)
  const prefix = `${firmId}/${clientId}/`
  if (!key.startsWith(prefix)) {
    throw new Error('Storage key escapes client prefix')
  }
}