const fs = require('fs');
const initSqlJs = require('sql.js');

;(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/notary.db');
  const db = new SQL.Database(new Uint8Array(buf));

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  const tables = (tablesRes[0]?.values || []).map((r) => r[0]);
  console.log('tables:', tables);

  const docsCount = tables.includes('documents')
    ? db.exec('SELECT COUNT(*) as c FROM documents;')[0]?.values?.[0]?.[0] ?? 0
    : 0;
  console.log('documents count:', docsCount);

  const usersCount = tables.includes('users')
    ? db.exec('SELECT COUNT(*) as c FROM users;')[0]?.values?.[0]?.[0] ?? 0
    : 0;
  console.log('users count:', usersCount);

  const ownerDocsCount = tables.includes('owner_documents')
    ? db.exec('SELECT COUNT(*) as c FROM owner_documents;')[0]?.values?.[0]?.[0] ?? 0
    : 0;
  console.log('owner_documents count:', ownerDocsCount);
})();
