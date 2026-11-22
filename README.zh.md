# Umami Better SQLite3

[English](README.md) | **简体中文**

一个可自托管、注重隐私的网站分析平台 —— **[Umami](https://umami.is) 的 SQLite 版本**。

本项目基于 Umami，将原本的 PostgreSQL / MySQL / ClickHouse 数据库栈替换为单个
[SQLite](https://www.sqlite.org/) 文件，底层使用
[`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)。它保留了 Umami 的仪表盘、统计脚本、
分享链接、团队、报告和事件追踪能力，同时把部署简化为“一个 Node.js 进程 + 一个数据库文件”。

| **数据库** | SQLite 3（通过 `better-sqlite3`） |
|---|:--|
| **运行时** | Node.js 20+（推荐 22 LTS） |
| **许可证** | [MIT](LICENSE) |

> [!NOTE]
> 这是社区分支，并非 Umami 官方发行版。上游项目请见
> [umami-software/umami](https://github.com/umami-software/umami)。

---

## 为什么选择这个分支

Umami 通常需要 PostgreSQL/MySQL 存放元数据、ClickHouse 存放事件数据。这对高流量、可横向扩展的
部署来说非常合适，但对个人博客、小团队或内部工具而言，基础设施负担过重。

这个分支让数据库不再是问题：

- **单文件、零外部服务** —— 不需要 PostgreSQL、MySQL、ClickHouse 或 Kafka。
- **自动初始化** —— 首次启动时自动建表和索引，无需执行迁移命令。
- **内置管理员** —— 空数据库会自动写入 `admin` / `umami` 账号。
- **WAL 模式** —— 启用 `journal_mode = WAL` 和 `busy_timeout = 5000`，写入期间仍可并发读取。
- **易于迁移** —— 复制一个文件即可备份，移动 `data/` 即可搬迁整个实例。
- **仍然是 Umami** —— 相同的界面、统计脚本、API、分享链接、团队、分段和报告。

所有分析查询都已在 `src/queries/sqlite` 和 `src/queries/sql` 中改写为 SQLite 方言。
源码中仍保留部分遗留的 ClickHouse 分支，但它们不属于受支持的配置。

---

## 环境要求

- Node.js 20 或更高版本。
- pnpm 9+
- **不需要任何外部数据库服务。**

---

## 安装和部署

```bash
pnpm install
```

```bash
pnpm build && pnpm start
```

Next.js 将在 `http://localhost:3000` 启动。

---

## 配置项 `.env`

| 配置项 | 默认值 | 描述 |
|---|---|---|
| `DATABASE_URL` | `file:./data/umami.db` | SQLite 数据库路径。相对路径基于工作目录解析。 |
| `PORT` | `3000` | 生产环境端口号 |

保留大部分 Umami 的其他环境变量，如 `DISABLE_LOGIN`、`DISABLE_TELEMETRY`、`DISABLE_UPDATES` 等。

---

MIT License

© 2026 ZeoSeven