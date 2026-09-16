-- Postgres 16+. Extensiones (spec §6).
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;
