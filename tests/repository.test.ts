import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import {
  optimizeImage,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
} from "../src/lib/image-processing";

test("large images compress below 200,000 bytes with bounded dimensions", async () => {
  const input = await sharp(randomBytes(1800 * 1200 * 3), {
    raw: { width: 1800, height: 1200, channels: 3 },
  })
    .png()
    .toBuffer();
  assert.ok(input.length > 3_000_000);
  const output = await optimizeImage(input);
  assert.ok(output.length <= MAX_IMAGE_BYTES);
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width! <= 1600);
  assert.ok(Math.abs(meta.width! / meta.height! - 1.5) < 0.01);
});
test("small transparent images retain alpha and are not enlarged", async () => {
  const input = await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(await optimizeImage(input)).metadata();
  assert.equal(meta.width, 40);
  assert.equal(meta.height, 20);
  assert.equal(meta.hasAlpha, true);
});
test("invalid images and oversized inputs are rejected", async () => {
  await assert.rejects(optimizeImage(Buffer.from("<svg onload='alert(1)'/>")));
  await assert.rejects(
    optimizeImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1)),
    /10 MB/,
  );
});
test("Postgres migration enforces ownership, relationships, conflict detection and cascade cleanup", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public,storage to authenticated;
 grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`);
    await db.exec(
      await readFile("supabase/migrations/202610220001_initial.sql", "utf8"),
    );
    const alice = "00000000-0000-4000-8000-000000000001",
      bob = "00000000-0000-4000-8000-000000000002";
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    const insert = async (sql: string) =>
      (await db.query<{ id: string }>(sql)).rows[0].id;
    const project = await insert(
      `insert into projects(user_id,name,image) values('${alice}','World','/api/images/${alice}/aaa.webp') returning id`,
    );
    const other = await insert(
      `insert into projects(user_id,name) values('${alice}','Other') returning id`,
    );
    const type = await insert(
      `insert into character_types(project_id,name) values('${project}','Human') returning id`,
    );
    const character = await insert(
      `insert into entities(project_id,kind,name,character_type_id) values('${project}','character','Hero','${type}') returning id`,
    );
    await assert.rejects(
      db.exec(
        `insert into entities(project_id,kind,name,character_type_id) values('${other}','character','Invalid','${type}')`,
      ),
    );
    await assert.rejects(
      db.exec(`delete from character_types where id='${type}'`),
    );
    const story = await insert(
      `insert into story_events(project_id,title,character_ids) values('${project}','Opening',array['${character}']::uuid[]) returning id`,
    );
    await assert.rejects(
      db.exec(
        `insert into story_events(project_id,title,character_ids) values('${other}','Invalid',array['${character}']::uuid[])`,
      ),
    );
    const version = (
      await db.query<{ version: string }>(
        `select updated_at::text as version from story_events where id='${story}'`,
      )
    ).rows[0].version;
    await db.exec(
      `update story_events set title='Changed' where id='${story}'`,
    );
    assert.equal(
      (
        await db.query(
          `update story_events set title='Stale' where id='${story}' and updated_at='${version}' returning id`,
        )
      ).rows.length,
      0,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    assert.equal((await db.query("select * from projects")).rows.length, 0);
    assert.equal((await db.query("select * from story_events")).rows.length, 0);
    assert.equal(
      (
        await db.query(
          `delete from projects where id='${project}' returning id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(
        `insert into story_events(project_id,title) values('${project}','Intrusion')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id,name) values('narrative-images','${alice}/xxx.webp')`,
      ),
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${alice}',false)`,
    );
    await db.exec(`delete from entities where id='${character}'`);
    assert.deepEqual(
      (
        await db.query<{ character_ids: string[] }>(
          `select character_ids from story_events where id='${story}'`,
        )
      ).rows[0].character_ids,
      [],
    );
    await db.exec(
      `insert into entities(project_id,kind,name,character_type_id) values('${project}','character','Second hero','${type}')`,
    );
    await db.exec(`delete from projects where id='${project}'`);
    assert.equal((await db.query("select * from story_events")).rows.length, 0);
    assert.equal(
      (await db.query("select * from character_types")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from image_cleanup")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
