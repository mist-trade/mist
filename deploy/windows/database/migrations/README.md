# Database migrations

Future database migrations live here.

The Windows appliance currently installs and preserves the portable MySQL
runtime, credentials, service, and data directory. Business table creation is
kept as an explicit migration/import step instead of being coupled to MySQL
installation.

Until a migration runner is added, bootstrap a new database by providing either:

```powershell
..\install-all.ps1 -InstallPortableMySQL -MysqlDumpFile D:\backups\mist.sql
..\install-all.ps1 -InstallPortableMySQL -MysqlSchemaFile D:\backups\schema.sql
```
