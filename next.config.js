const bundleAnalyzer = require('@next/bundle-analyzer')
const withOffline = require('next-pwa')

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

module.exports = withBundleAnalyzer(
  withOffline({
    target: 'serverless',
    pwa: {
      disable: process.env.NODE_ENV !== 'production',
      register: false,
      dest: 'public',
    },
    webpack: (config, options) => {
      config.module.rules.push({
        test: /\.js$/,
        include: /node_modules\/graphql-language-service-parser/,
        use: [options.defaultLoaders.babel],
      })

      return config
    },
  })
)
