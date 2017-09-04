var config = {};

config.apiKey = 'RGAPI-9975d4c3-1140-4a6d-b4a3-713d3e2df238';
config.demoKeyRateLimitPer10s = 200;
config.demoKeyRateLimitPer10m = 500;
config.productionKeyRateLimitPer10s = 3000;
config.productionRateLimitPer10m = 180000;
config.port = 8887;
config.db = "mongodb://localhost/lol-project";

module.exports = config;