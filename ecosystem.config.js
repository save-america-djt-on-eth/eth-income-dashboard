require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'backend',
      script: './backend/index.js',
      watch: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        INFURA_API_KEY: process.env.INFURA_API_KEY
      }
    },
    {
      name: 'frontend',
      script: 'http-server frontend -p 8080',
      watch: false,
    }
  ]
};
