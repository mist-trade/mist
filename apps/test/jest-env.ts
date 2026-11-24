// Synthetic bootstrap values keep module-import tests independent of local .env files.
process.env.NODE_ENV ??= 'test';
process.env.mysql_server_host ??= '127.0.0.1';
process.env.mysql_server_port ??= '3306';
process.env.mysql_server_username ??= 'mist_test';
process.env.mysql_server_password ??= 'mist_test';
process.env.mysql_server_database ??= 'mist_test';

// 交易层 jest 全局环境（add-virtual-trading-layer 组8）：默认禁用外部私仓插件
// 目录探测——平级 mist-alpha-private/dist 已捆绑整份公共域，jest 模块沙箱内
// require 该 bundle 有重量级副作用；需要私仓插件的集成测试显式覆盖本变量。
process.env.MIST_PRIVATE_PLUGINS_DIR =
  process.env.MIST_PRIVATE_PLUGINS_DIR_FORCED ??
  '/nonexistent-mist-private-plugins-for-tests';
