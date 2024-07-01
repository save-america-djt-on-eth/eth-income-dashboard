module.exports = {
  apps: [
    {
      name: 'backend',
      script: './backend/index.js',
      watch: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        INFURA_API_KEY: 'your_infura_api_key'
      }
    },
    {
      name: 'frontend',
      script: 'http-server frontend -p 8080',
      watch: false,
    }
  ]
};
