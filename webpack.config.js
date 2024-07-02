const path = require('path');

module.exports = {
    entry: './frontend/scripts.js', // Adjust the path if your scripts.js file is located elsewhere
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'frontend')
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    mode: 'development'
};
