const { initDatabase, getDbReady, dbQuery } = require('../database');

// Wait for database initialization before running tests
beforeAll(async () => {
  await initDatabase();
  
  // Wait until db is ready
  while (!getDbReady()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});

// Clear data from tables between tests to ensure test isolation
afterEach(async () => {
  const tables = ['users', 'vitals', 'glucose', 'weight', 'reports', 'profiles', 'medications'];
  for (const table of tables) {
    try {
      await dbQuery.run(`DELETE FROM ${table}`);
    } catch (e) {
      // Ignore if table doesn't exist yet
    }
  }
});
