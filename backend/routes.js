const { getData, getCache } = require('./cache');

const setupRoutes = (app) => {
  app.get('/api/data', getData);
  app.get('/api/cache', getCache);
};

module.exports = { setupRoutes };
