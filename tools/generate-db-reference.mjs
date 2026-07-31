#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outputPath = path.join(repoRoot, 'docs', 'generated', 'supabase-public-schema.md');

const knownViews = new Set([
  'coaching_notes',
  'meeting_attendance',
  'monthly_kpi_records',
  'node_assets_v',
  'resource_block_locations',
  'resource_primary_location',
  'tag_usage',
  'user_achievements_extraneous',
  'user_achievements_inferred',
  'user_achievements_missing',
  'user_attention_effective',
]);

function loadLocalEnvironment() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const envPath = path.join(repoRoot, '.env.local');
  if (!existsSync(envPath)) return;

  if (typeof process.loadEnvFile !== 'function') {
    throw new Error(
      'This Node version cannot load .env.local. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  process.loadEnvFile(envPath);
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/+$/, '');
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function compactType(schema) {
  const format = schema?.format;
  if (format === 'timestamp with time zone') return 'timestamptz';
  if (format === 'timestamp without time zone') return 'timestamp';
  if (format === 'double precision') return 'float8';
  if (format) return format;
  if (schema?.type === 'array') return `${compactType(schema.items)}[]`;
  return schema?.type ?? 'json';
}

function stripMetadataTags(description) {
  return String(description ?? '')
    .replace(/Note:\s*/g, '')
    .replace(/This is a Primary Key\.<pk\/>/g, '')
    .replace(/This is a Foreign Key to `[^`]+`\.<fk[^>]+\/>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseColumnMetadata(description) {
  const text = String(description ?? '');
  const foreignKey = text.match(/<fk table='([^']+)' column='([^']+)'\/>/);
  return {
    primaryKey: text.includes('<pk/>'),
    foreignKey: foreignKey ? `${foreignKey[1]}.${foreignKey[2]}` : null,
    comment: stripMetadataTags(text),
  };
}

async function collectTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(absolutePath)));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function collectRpcCallsites() {
  const callsites = new Map();
  const sourceRoot = path.join(repoRoot, 'src');

  for (const file of await collectTypeScriptFiles(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)) {
      const name = match[1];
      const relativePath = path.relative(repoRoot, file).replaceAll('\\', '/');
      if (!callsites.has(name)) callsites.set(name, new Set());
      callsites.get(name).add(relativePath);
    }
  }

  return callsites;
}

function relationSection(name, definition) {
  const required = new Set(definition.required ?? []);
  const kind = knownViews.has(name) ? 'view' : 'table';
  const lines = [`### \`${name}\` (${kind})`, ''];
  const description = stripMetadataTags(definition.description);
  if (description) lines.push(description, '');
  lines.push('| Column | Type | Null/default | Key / relation | Comment |');
  lines.push('|---|---|---|---|---|');

  for (const [columnName, property] of Object.entries(definition.properties ?? {})) {
    const metadata = parseColumnMetadata(property.description);
    const keys = [
      metadata.primaryKey ? 'PK' : null,
      metadata.foreignKey ? `FK -> \`${metadata.foreignKey}\`` : null,
    ]
      .filter(Boolean)
      .join('; ');
    lines.push(
      `| \`${columnName}\` | \`${compactType(property)}\` | ${required.has(columnName) ? 'required' : 'nullable/default'} | ${keys} | ${escapeCell(metadata.comment)} |`,
    );
  }

  lines.push('');
  return lines;
}

function rpcSection(spec, callsites) {
  const lines = [
    '## Exposed Postgres functions',
    '',
    'The argument marker is about the RPC request shape: `!` means the key is required in the request and `?` means it has a database default. A required key may still accept `null` if the SQL parameter type permits it.',
    '',
    '| Function | Arguments | Called by website |',
    '|---|---|---|',
  ];

  const rpcNames = Object.keys(spec.paths ?? {})
    .filter((route) => route.startsWith('/rpc/'))
    .map((route) => route.slice('/rpc/'.length))
    .sort((a, b) => a.localeCompare(b));

  for (const name of rpcNames) {
    const post = spec.paths[`/rpc/${name}`]?.post;
    const bodySchema = post?.parameters?.find((parameter) => parameter.in === 'body')?.schema;
    const required = new Set(bodySchema?.required ?? []);
    const args = Object.entries(bodySchema?.properties ?? {})
      .map(
        ([argumentName, argumentSchema]) =>
          `\`${argumentName}: ${compactType(argumentSchema)}${required.has(argumentName) ? '!' : '?'}\``,
      )
      .join(', ');
    const locations = [...(callsites.get(name) ?? [])]
      .sort()
      .map((location) => `\`${location}\``)
      .join('<br>');
    lines.push(`| \`${name}\` | ${args || 'none'} | ${locations || '—'} |`);
  }

  lines.push('');
  return lines;
}

async function main() {
  loadLocalEnvironment();
  const supabaseUrl = requireEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');

  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase schema request failed with HTTP ${response.status}.`);
  }

  const spec = await response.json();
  const callsites = await collectRpcCallsites();
  const relationNames = Object.keys(spec.definitions ?? {}).sort((a, b) => a.localeCompare(b));
  const generatedAt = new Date().toISOString();

  const lines = [
    '# Generated Supabase public schema',
    '',
    `Generated at: \`${generatedAt}\``,
    '',
    "Source: the configured Supabase project's PostgREST OpenAPI document. The generator reads schema metadata only; it does not read table rows.",
    '',
    '> Do not edit this file by hand. Run `npm run docs:db` from the website repository to refresh it.',
    '',
    '## Reading this reference',
    '',
    '- "required" is the OpenAPI representation of a required column. "nullable/default" means the column is nullable or the database supplies a default.',
    "- Relation kind is classified by the website's known base-table/view pairs. Treat it as application documentation, not a replacement for a full `pg_dump`.",
    '- Primary and foreign keys come from PostgREST metadata. Cross-schema links such as `profiles.id` to Supabase Auth may not appear.',
    '- RLS policies, grants, indexes, triggers, check constraints, and function bodies are not included in OpenAPI.',
    '',
    `## Relations (${relationNames.length})`,
    '',
  ];

  for (const name of relationNames) {
    lines.push(...relationSection(name, spec.definitions[name]));
  }

  lines.push(...rpcSection(spec, callsites));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
