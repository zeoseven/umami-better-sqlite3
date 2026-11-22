# Umami SQLite

**English** | [简体中文](README.zh.md)

A self-hostable, privacy-focused web analytics platform — the **[Umami](https://umami.is) SQLite edition**.

Built on Umami, this project replaces the original PostgreSQL / MySQL / ClickHouse database stack with a single
[SQLite](https://www.sqlite.org/) file, powered by
[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3). It retains Umami's dashboard, tracking script,
share links, teams, reports, and event tracking, while simplifying deployment to "one Node.js process + one database file".

| **Database** | SQLite 3 (via `better-sqlite3`) |
|---|---|
| **Runtime** | Node.js 20+ (22 LTS recommended) |
| **License** | [MIT](LICENSE) |

> [!NOTE]
> This is a community fork, not an official Umami release. For the upstream project, see
> [umami-software/umami](https://github.com/umami-software/umami).

---

## Why this fork

Umami typically requires PostgreSQL/MySQL for metadata and ClickHouse for event data. That is a great fit for
high-traffic, horizontally scalable deployments, but it is too much infrastructure for a personal blog, a small team,
or an internal tool.

This fork makes the database a non-issue:

- **Single file, zero external services** — no PostgreSQL, MySQL, ClickHouse, or Kafka required.
- **Automatic initialization** — tables and indexes are created automatically on first start; no migration commands needed.
- **Built-in administrator** — an empty database is automatically seeded with the `admin` / `umami` account.
- **WAL mode** — `journal_mode = WAL` and `busy_timeout = 5000` are enabled, so concurrent reads remain possible during writes.
- **Easy to migrate** — back up by copying a single file; move the whole instance by moving `data/`.
- **Still Umami** — the same interface, tracking script, API, share links, teams, segments, and reports.

All analytics queries have been rewritten for the SQLite dialect in `src/queries/sqlite` and `src/queries/sql`.
Some legacy ClickHouse branches remain in the source, but they are not part of the supported configuration.

---

## Requirements

- Node.js 20 or later.
- pnpm 9+
- **No external database service is required.**

---

## Installation and deployment

```bash
pnpm install
```

```bash
pnpm build && pnpm start
```

Next.js will start at `http://localhost:3000`.

---

## Configuration via `.env`

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./data/umami.db` | SQLite database path. Relative paths are resolved against the working directory. |
| `PORT` | `3000` | Port number for production |

Most other Umami environment variables are still supported, such as `DISABLE_LOGIN`, `DISABLE_TELEMETRY`, and
`DISABLE_UPDATES`.

---

MIT License

© 2026 ZeoSeven
