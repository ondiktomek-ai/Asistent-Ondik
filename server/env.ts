// Načte .env dřív, než ostatní moduly začnou číst process.env.
try {
  process.loadEnvFile('.env');
} catch {
  // .env není povinný – proměnné mohou přijít i z prostředí.
}
