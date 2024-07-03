require('dotenv').config();
const express = require('express');
const path = require('path');
const { applyMiddlewares } = require('./middlewares');
const { updateCache, getData, getCache } = require('./cache');
const { setupRoutes } = require('./routes');

const app = express();
const port = process.env.PORT || 3000;

applyMiddlewares(app);

app.use(express.static(path.join(__dirname, '../frontend')));

updateCache();
setInterval(updateCache, 1800000); // Update cache every 30 minutes

setupRoutes(app);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
