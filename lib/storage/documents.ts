import 'server-only'

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  assertClientStorageKey,
  assertFirmStorageKey,
} from '@/lib/db/identity'

// Uploads and downloads client documents in cloud object storage.

// Reads a required environment variable.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

let client: S3Client | null = null

// Returns a shared S3 client configured from environment variables.
function s3(): S3Client {
  if (client) return client
  client = new S3Client({
    forcePathStyle: true,
    region: requireEnv('AWS_REGION'),
    endpoint: requireEnv('AWS_ENDPOINT_URL_S3'),
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
  })
  return client
}

// Returns the bucket name used for uploaded documents.
export function documentsBucket(): string {
  return process.env.NEON_STORAGE_BUCKET || 'documents'
}

const DEFAULT_SIGNED_GET_SECONDS = 120

// Saves a file under the firm and client folder in storage.
export async function uploadDocumentObject(params: {
  firmId: string
  clientId: string
  key: string
  body: Buffer
  contentType: string
}): Promise<void> {
  assertClientStorageKey(params.firmId, params.clientId, params.key)
  await s3().send(
    new PutObjectCommand({
      Bucket: documentsBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  )
}

// Creates a short-lived link to download one stored file.
export async function createDocumentDownloadUrl(params: {
  firmId: string
  clientId: string
  key: string
  expiresInSeconds?: number
}): Promise<string> {
  assertClientStorageKey(params.firmId, params.clientId, params.key)
  const expiresIn = params.expiresInSeconds ?? DEFAULT_SIGNED_GET_SECONDS
  if (expiresIn < 30 || expiresIn > 900) {
    throw new Error('Signed URL expiry out of allowed range (30–900s)')
  }
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: documentsBucket(),
      Key: params.key,
    }),
    { expiresIn }
  )
}

// Deletes one or more stored files for a firm.
export async function deleteDocumentObjects(params: {
  firmId: string
  keys: string[]
}): Promise<void> {
  const keys = params.keys.filter(Boolean)
  for (const key of keys) {
    assertFirmStorageKey(params.firmId, key)
  }
  if (keys.length === 0) return
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: documentsBucket(),
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    )
  }
}

// Lists file keys stored under a firm or one client.
export async function listDocumentKeys(params: {
  firmId: string
  clientId?: string
}): Promise<string[]> {
  const prefix = params.clientId
    ? `${params.firmId}/${params.clientId}/`
    : `${params.firmId}/`
  if (params.clientId) {
    assertClientStorageKey(params.firmId, params.clientId, `${prefix}x`)
  } else {
    assertFirmStorageKey(params.firmId, `${prefix}x`)
  }

  const keys: string[] = []
  let continuationToken: string | undefined
  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: documentsBucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        assertFirmStorageKey(params.firmId, obj.Key)
        keys.push(obj.Key)
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}