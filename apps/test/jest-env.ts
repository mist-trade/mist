// Synthetic bootstrap values keep module-import tests independent of local .env files.
process.env.NODE_ENV ??= 'test';
process.env.mysql_server_host ??= '127.0.0.1';
process.env.mysql_server_port ??= '3306';
process.env.mysql_server_username ??= 'mist_test';
process.env.mysql_server_password ??= 'mist_test';
process.env.mysql_server_database ??= 'mist_test';
