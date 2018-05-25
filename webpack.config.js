var path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: './index.js',
  target: 'node',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'index.js'
  },
  plugins: [
    new CopyPlugin([
      { from: 'manifest.konnector' },
      { from: 'assets'},
      { from: 'README.md' },
      { from: 'LICENSE' }
    ])
  ]
}
