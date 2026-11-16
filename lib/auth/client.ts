'use client'

import { createAuthClient } from '@neon/auth/next'

// Browser-side setup for signing users in and out.

export const authClient = createAuthClient()