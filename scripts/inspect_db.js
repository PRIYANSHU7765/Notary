const fs = require('fs');
const initSqlJs = require('sql.js');

;(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/notary.db');
  const db = new SQL.Database(new Uint8Array(buf));

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  const tables = (tablesRes[0]?.values || []).map((r) => r[0]);
  console.log('tables:', tables);

  const docsRes = db.exec('SELECT COUNT(*) as c FROM documents;');
  const docsCount = docsRes[0]?.values?.[0]?.[0] ?? 0;
  console.log('documents count:', docsCount);

  const usersRes = db.exec('SELECT COUNT(*) as c FROM users;');
  const usersCount = usersRes[0]?.values?.[0]?.[0] ?? 0;
  console.log('users count:', usersCount);
})();
