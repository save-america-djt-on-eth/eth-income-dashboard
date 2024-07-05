### README.md

# Donald J. Trump ETH Dashboard

## Overview

The Donald J. Trump ETH Dashboard is a web application that visualizes Ethereum (ETH) holdings and the amount of ETH generated by the $DJT token. It includes a dynamic frontend built with HTML, CSS, and JavaScript, and a backend server powered by Node.js and Express. The application interacts with the Ethereum blockchain using Infura and Etherscan APIs.

## Features

- Displays current ETH holdings.
- Shows $DJT generated ETH count and percentage.
- Interactive chart with different time frames (1D, 7D, 30D, Custom).

## Requirements

- Node.js (v14.x or higher)
- npm (v6.x or higher)
- Infura API Key
- Etherscan API Key
- Nginx (for production deployment)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/eth-dashboard.git
cd eth-dashboard
```

### 2. Install dependencies

```bash
cd backend
npm install
```

### 3. Set up environment variables

Create a `.env` file in the `backend` directory with the following content:

```plaintext
INFURA_API_KEY=your_infura_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
PORT=3000
```

### 4. Start the server

```bash
node index.js
```

The backend server should now be running on `http://localhost:3000`.

### 5. Set up Nginx (for production)

#### Install Nginx

```bash
sudo apt update
sudo apt install nginx
```

#### Configure Nginx

Create a new Nginx configuration file for your application:

```bash
sudo nano /etc/nginx/sites-available/eth-dashboard
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your_domain_or_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /static/ {
        alias /path_to_your_project/frontend;
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        internal;
    }
}
```

Enable the new configuration:

```bash
sudo ln -s /etc/nginx/sites-available/eth-dashboard /etc/nginx/sites-enabled/
```

Test the configuration and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Deploy the frontend

Ensure your frontend files are in the `/path_to_your_project/frontend` directory. Nginx will serve these static files.

## Usage

- Navigate to your domain or IP in a web browser.
- The dashboard will load and display the current ETH holdings and $DJT generated ETH statistics.
- Use the buttons to switch between different time frames for the data visualization.

## Contributing

If you'd like to contribute, please fork the repository and use a feature branch. Pull requests are welcome.

## License

This project is licensed under the MIT License.

---