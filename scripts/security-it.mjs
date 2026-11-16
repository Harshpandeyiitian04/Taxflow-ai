// Live database checks that firms cannot read or change each other's data.
import fs from 'node:fs'
import path from 'node:path'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const USER_A = '56e3a3e9-83fe-4770-b3a0-29a9d28701d9'
const USER_B = '04acd052-0041-4b1d-9c73-3d3aee1d1a1b'
const EMAIL_A = 'security-it-firm-a@taxflow.test'
const EMAIL_B = 'security-it-firm-b@taxflow.test'

// Reads KEY=value lines from a file into process.env when not already set.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

loadEnvFile(path.resolve('.env.security-it.local'))

const adminUrl = process.env.ADMIN_DATABASE_URL
const appUrl = process.env.DATABASE_URL_APP
if (!adminUrl || !appUrl) {
  console.error('Missing ADMIN_DATABASE_URL or DATABASE_URL_APP')
  process.exit(1)
}

const results = []
// Prints PASS or FAIL and stores the outcome for the final report.
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// Opens a pool, runs your callback, then closes the connection.
async function withClient(url, fn) {
  const pool = new Pool({ connectionString: url })
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
    await pool.end()
  }
}

// Runs queries inside a transaction as if that user were logged in.
async function asUser(client, userId, fn) {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      userId,
    ])
    const out = await fn()
    await client.query('commit')
    return out
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
    }
    throw err
  }
}

const seed = await withClient(adminUrl, async (client) => {
  await client.query(`delete from public.ca_firms where email = any($1::text[])`, [
    [EMAIL_A, EMAIL_B],
  ])

  const firmA = (
    await client.query(
      `insert into public.ca_firms (user_id, email, firm_name, owner_name, plan)
       values ($1::uuid, $2, 'Firm A Security', 'Owner A', 'trial')
       returning id::text`,
      [USER_A, EMAIL_A]
    )
  ).rows[0].id

  const firmB = (
    await client.query(
      `insert into public.ca_firms (user_id, email, firm_name, owner_name, plan)
       values ($1::uuid, $2, 'Firm B Security', 'Owner B', 'trial')
       returning id::text`,
      [USER_B, EMAIL_B]
    )
  ).rows[0].id

  const clientA = (
    await client.query(
      `insert into public.clients (ca_firm_id, name, pan)
       values ($1::uuid, 'Client A1', 'AAAAA1111A')
       returning id::text`,
      [firmA]
    )
  ).rows[0].id

  const clientB = (
    await client.query(
      `insert into public.clients (ca_firm_id, name, pan)
       values ($1::uuid, 'Client B1', 'BBBBB2222B')
       returning id::text`,
      [firmB]
    )
  ).rows[0].id

  const docA = (
    await client.query(
      `insert into public.documents (client_id, ca_firm_id, type, storage_path, original_filename)
       values ($1::uuid, $2::uuid, 'form16', $3, 'a.pdf')
       returning id::text`,
      [clientA, firmA, `${firmA}/${clientA}/a.pdf`]
    )
  ).rows[0].id

  const docB = (
    await client.query(
      `insert into public.documents (client_id, ca_firm_id, type, storage_path, original_filename)
       values ($1::uuid, $2::uuid, 'form16', $3, 'b.pdf')
       returning id::text`,
      [clientB, firmB, `${firmB}/${clientB}/b.pdf`]
    )
  ).rows[0].id

  const tokenA = (
    await client.query(
      `insert into public.upload_tokens (client_id, ca_firm_id, token, expires_at, upload_count)
       values ($1::uuid, $2::uuid, $3, now() + interval '7 days', 0)
       returning token`,
      [clientA, firmA, 'a'.repeat(64)]
    )
  ).rows[0].token

  const tokenB = (
    await client.query(
      `insert into public.upload_tokens (client_id, ca_firm_id, token, expires_at, upload_count)
       values ($1::uuid, $2::uuid, $3, now() + interval '7 days', 0)
       returning token`,
      [clientB, firmB, 'b'.repeat(64)]
    )
  ).rows[0].token

  return { firmA, firmB, clientA, clientB, docA, docB, tokenA, tokenB }
})

record('seed_two_firms', true, `A=${seed.firmA.slice(0, 8)}… B=${seed.firmB.slice(0, 8)}…`)

await withClient(appUrl, async (client) => {
  await client.query('begin')
  const anonFirms = await client.query(`select id from public.ca_firms`)
  await client.query('commit')
  record(
    'anonymous_select_ca_firms_empty',
    anonFirms.rowCount === 0,
    `rows=${anonFirms.rowCount}`
  )

  const ownClients = await asUser(client, USER_A, async () => {
    return client.query(`select id::text, name from public.clients order by name`)
  })
  record(
    'firm_a_select_own_clients',
    ownClients.rowCount === 1 && ownClients.rows[0].id === seed.clientA,
    `rows=${ownClients.rowCount}`
  )

  const crossClients = await asUser(client, USER_A, async () => {
    return client.query(`select id::text from public.clients where id = $1::uuid`, [
      seed.clientB,
    ])
  })
  record(
    'firm_a_cannot_select_firm_b_client',
    crossClients.rowCount === 0,
    `rows=${crossClients.rowCount}`
  )

  const ownDocs = await asUser(client, USER_A, async () => {
    return client.query(`select id::text from public.documents`)
  })
  record(
    'firm_a_select_own_documents',
    ownDocs.rowCount === 1 && ownDocs.rows[0].id === seed.docA,
    `rows=${ownDocs.rowCount}`
  )

  const crossDocs = await asUser(client, USER_A, async () => {
    return client.query(`select id::text from public.documents where id = $1::uuid`, [
      seed.docB,
    ])
  })
  record(
    'firm_a_cannot_select_firm_b_document',
    crossDocs.rowCount === 0,
    `rows=${crossDocs.rowCount}`
  )

  let updateBlocked = false
  try {
    await asUser(client, USER_A, async () => {
      const r = await client.query(
        `update public.clients set name = 'HACKED' where id = $1::uuid returning id`,
        [seed.clientB]
      )
      if (r.rowCount === 0) updateBlocked = true
    })
  } catch {
    updateBlocked = true
  }
  const nameCheck = await withClient(adminUrl, async (c) => {
    const r = await c.query(`select name from public.clients where id = $1::uuid`, [
      seed.clientB,
    ])
    return r.rows[0]?.name
  })
  record(
    'firm_a_cannot_update_firm_b_client',
    updateBlocked && nameCheck === 'Client B1',
    `name=${nameCheck}`
  )

  let deleteBlocked = false
  try {
    await asUser(client, USER_A, async () => {
      const r = await client.query(
        `delete from public.clients where id = $1::uuid returning id`,
        [seed.clientB]
      )
      if (r.rowCount === 0) deleteBlocked = true
    })
  } catch {
    deleteBlocked = true
  }
  const stillExists = await withClient(adminUrl, async (c) => {
    const r = await c.query(`select 1 from public.clients where id = $1::uuid`, [
      seed.clientB,
    ])
    return r.rowCount === 1
  })
  record(
    'firm_a_cannot_delete_firm_b_client',
    deleteBlocked && stillExists,
    `exists=${stillExists}`
  )

  let insertSpoofBlocked = false
  try {
    await asUser(client, USER_A, async () => {
      await client.query(
        `insert into public.clients (ca_firm_id, name) values ($1::uuid, 'spoof')`,
        [seed.firmB]
      )
    })
  } catch (err) {
    insertSpoofBlocked = /policy|permission|42501/i.test(String(err.message || err))
  }
  record(
    'firm_a_cannot_insert_into_firm_b',
    insertSpoofBlocked,
    insertSpoofBlocked ? 'policy denied' : 'UNEXPECTED ALLOW'
  )

  let consumeDenied = false
  let consumeCode = ''
  try {
    await asUser(client, USER_A, async () => {
      await client.query(`select public.consume_extraction($1::uuid, 10)`, [
        seed.firmB,
      ])
    })
  } catch (err) {
    consumeDenied = true
    consumeCode = err.code || ''
    if (!consumeCode && /42501|denied/i.test(err.message || '')) consumeCode = '42501'
  }
  record(
    'firm_a_cannot_consume_firm_b_quota',
    consumeDenied,
    `code=${consumeCode || 'err'}`
  )

  const ownConsume = await asUser(client, USER_A, async () => {
    const r = await client.query(
      `select public.consume_extraction($1::uuid, 10) as ok`,
      [seed.firmA]
    )
    return r.rows[0]?.ok === true
  })
  record('firm_a_can_consume_own_quota', ownConsume, `ok=${ownConsume}`)

  const firmBClients = await asUser(client, USER_B, async () => {
    return client.query(`select id::text from public.clients`)
  })
  record(
    'firm_b_select_own_clients',
    firmBClients.rowCount === 1 && firmBClients.rows[0].id === seed.clientB,
    `rows=${firmBClients.rowCount}`
  )

  await client.query('begin')
  await client.query(`select set_config('request.jwt.claims', '{"sub":"not-a-uuid","role":"authenticated"}', true)`)
  let invalidJwtEmpty = false
  try {
    const r = await client.query(`select id from public.ca_firms`)
    invalidJwtEmpty = r.rowCount === 0
  } catch {
    invalidJwtEmpty = true
  }
  await client.query('rollback')
  record('invalid_jwt_sub_no_rows_or_error', invalidJwtEmpty, '')

  await client.query('begin')
  let anonRpcDenied = false
  try {
    await client.query(`select public.consume_extraction($1::uuid, 10)`, [seed.firmA])
  } catch (err) {
    anonRpcDenied = /denied|42501/i.test(String(err.message || err))
  }
  await client.query('rollback')
  record('anonymous_rpc_consume_denied', anonRpcDenied, '')

  await client.query('begin')
  const claimed = await client.query(
    `select client_id::text, ca_firm_id::text from public.claim_upload_slot($1, 5)`,
    [seed.tokenA]
  )
  const slotOk =
    claimed.rowCount === 1 &&
    claimed.rows[0].client_id === seed.clientA &&
    claimed.rows[0].ca_firm_id === seed.firmA
  let uploadInsertOk = false
  if (slotOk) {
    const ins = await client.query(
      `insert into public.documents (client_id, ca_firm_id, type, original_filename)
       values ($1::uuid, $2::uuid, 'form16', 'upload-token.pdf')
       returning id::text`,
      [seed.clientA, seed.firmA]
    )
    uploadInsertOk = ins.rowCount === 1
    const consumeUpload = await client.query(
      `select public.consume_extraction($1::uuid, 10) as ok`,
      [seed.firmA]
    )
    record(
      'upload_token_can_consume_own_firm_quota',
      consumeUpload.rows[0]?.ok === true,
      ''
    )
  }
  await client.query('commit')
  record('claim_upload_slot_firm_a', slotOk, `rows=${claimed.rowCount}`)
  record('upload_token_insert_document', uploadInsertOk, '')

  await client.query('begin')
  await client.query(`select public.claim_upload_slot($1, 5)`, [seed.tokenB])
  let crossUploadInsertBlocked = false
  try {
    await client.query(
      `insert into public.documents (client_id, ca_firm_id, type, original_filename)
       values ($1::uuid, $2::uuid, 'form16', 'cross.pdf')`,
      [seed.clientA, seed.firmA]
    )
  } catch (err) {
    crossUploadInsertBlocked = /policy|permission|42501/i.test(
      String(err.message || err)
    )
  }
  await client.query('rollback')
  record(
    'upload_token_b_cannot_insert_firm_a_document',
    crossUploadInsertBlocked,
    ''
  )
})

const raceLimit = 5
await withClient(adminUrl, async (c) => {
  await c.query(`delete from public.usage_daily where firm_id = $1::uuid`, [seed.firmA])
})

const racePools = Array.from({ length: 12 }, () => new Pool({ connectionString: appUrl }))
const raceResults = await Promise.all(
  racePools.map(async (pool) => {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: USER_A, role: 'authenticated' }),
      ])
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USER_A])
      const r = await c.query(
        `select public.consume_extraction($1::uuid, $2::int) as ok`,
        [seed.firmA, raceLimit]
      )
      await c.query('commit')
      return r.rows[0]?.ok === true
    } catch {
      try {
        await c.query('rollback')
      } catch {
      }
      return false
    } finally {
      c.release()
      await pool.end()
    }
  })
)
const successes = raceResults.filter(Boolean).length
const finalCount = await withClient(adminUrl, async (c) => {
  const r = await c.query(
    `select coalesce(sum(count),0)::int as n from public.usage_daily where firm_id = $1::uuid`,
    [seed.firmA]
  )
  return r.rows[0].n
})
record(
  'quota_race_respects_limit',
  successes === raceLimit && finalCount === raceLimit,
  `successes=${successes} finalCount=${finalCount} limit=${raceLimit}`
)

await withClient(appUrl, async (client) => {
  const docs = await asUser(client, USER_B, async () => {
    return client.query(`select id::text from public.documents where id = $1::uuid`, [
      seed.docB,
    ])
  })
  record(
    'firm_b_can_access_own_document',
    docs.rowCount === 1,
    `rows=${docs.rowCount}`
  )
})

const failed = results.filter((r) => !r.ok)
const summary = {
  branch: process.env.SECURITY_IT_BRANCH || 'security-hardening-002',
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed,
  authUsers: { USER_A, USER_B },
}
fs.writeFileSync(
  path.resolve('scripts/security-it-results.json'),
  JSON.stringify({ summary, results }, null, 2)
)
console.log('\nSUMMARY', JSON.stringify(summary))
process.exit(failed.length ? 1 : 0)
