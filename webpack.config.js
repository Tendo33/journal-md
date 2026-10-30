const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const { normalizeTarget, manifestForTarget, assertEnvTargetNotEmpty } = require('./scripts/manifest-target');

// 目标浏览器：默认 chrome（Chrome / Edge，产出 dist/）；--env target=firefox 产出 dist-firefox/。
// 不生成 source map（devtool: false），verify:dist 会检查。
module.exports = (env, argv) => {
  assertEnvTargetNotEmpty(process.argv);
  const target = normalizeTarget(env && env.target);
  const mode = argv.mode || 'development';
  return {
    mode,
    devtool: false,
    entry: {
      background: './src/background/index.js',
      content: './src/content/index.js',
      popup: './src/ui/popup/popup.js',
      options: './src/ui/options/options.js',
    },
    output: {
      path: path.resolve(__dirname, target === 'firefox' ? 'dist-firefox' : 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: { loader: 'babel-loader' },
        },
      ],
    },
    optimization: {
      nodeEnv: false,
      // 不压缩：AMO 审核要能读懂产物并复现构建（cross-browser-plan §4）
      minimize: false,
      splitChunks: false,
    },
    performance: { hints: false },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(mode),
        __BUILD_TARGET__: JSON.stringify(target),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: 'src/manifest.json',
            to: 'manifest.json',
            transform: (content) => JSON.stringify(manifestForTarget(JSON.parse(content.toString()), target), null, 2) + '\n',
          },
          { from: 'src/_locales', to: '_locales' },
          { from: 'src/ui/popup/popup.html', to: 'popup.html' },
          { from: 'src/ui/popup/popup.css', to: 'popup.css' },
          { from: 'src/ui/options/options.html', to: 'options.html' },
          { from: 'src/ui/options/options.css', to: 'options.css' },
          { from: 'src/ui/shared/tokens.css', to: 'tokens.css' },
          { from: 'assets/icon-*.png', to: 'assets/[name][ext]' },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@core': path.resolve(__dirname, 'src/core'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@config': path.resolve(__dirname, 'src/config'),
      },
    },
  };
};
