module.exports = {
    apps: [
      {
        name: "aiga-image-cache",
        script: "dist/index.js",
        watch: false,
        exec_mode: "cluster",
        instances: 0,
        env: {
          NODE_ENV: "development",
          LOG_LEVEL: "debug",
          PORT: 7001
        },
        env_production: {
          NODE_ENV: "production",
          LOG_LEVEL: "info",
          PORT: 7001
        },
        output: "/home/ubuntu/workspace/logs/aiga-image-cache/out.log",
        error: "/home/ubuntu/workspace/logs/aiga-image-cache/err.log",
        log_date_format: "YYYY-MM-DD HH:mm:ss",
      },
    ]
  }