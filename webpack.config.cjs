// const path = require('path');
// const HtmlWebpackPlugin = require('html-webpack-plugin');

// module.exports = {
//   mode: 'development',
//   entry: './src/client/index.tsx',
//   output: {
//     path: path.resolve(__dirname, 'dist'),
//     filename: 'bundle.js',
//     clean: true
//   },
//   module: {
//     rules: [
//       {
//         test: /\.(ts|tsx)$/,
//         use: 'ts-loader',
//         exclude: /node_modules/,
//       },
//       {
//         test: /\.css$/,
//         use: ['style-loader', 'css-loader'],
//       },
//     ],
//   },
//   resolve: {
//     extensions: ['.tsx', '.ts', '.js', '.jsx'],
//     modules: [path.resolve(__dirname, 'src'), 'node_modules'],
//   },
//   plugins: [
//     new HtmlWebpackPlugin({
//       template: './public/index.html',
//     }),
//   ],
//   devServer: {
//     static: {
//       directory: path.join(__dirname, 'public'),
//     },
//     port: 3003,
//     hot: true,
//     proxy: {
//       '/api': 'http://localhost:3000',
//     },
//     historyApiFallback: true,
//   },
//   devtool: 'source-map',
// }; 



const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: path.resolve(__dirname, 'src/client/index.tsx'), // ✅ Ensure correct entry path
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@components': path.resolve(__dirname, 'src/client/components/'), // ✅ Set alias for easy imports
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    port: 3003,
    hot: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
    historyApiFallback: true,
  },
  devtool: 'source-map',
};
