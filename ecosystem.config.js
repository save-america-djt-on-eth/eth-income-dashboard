module.exports = {
  apps: [
    {
      name: 'backend',
      script: './backend/index.js',
      watch: true,
    },
    {
      name: 'frontend',
      script: 'http-server frontend -p 8080',
      watch: false,
    }
  ]
};
