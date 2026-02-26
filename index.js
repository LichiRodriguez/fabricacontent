require("dotenv/config");
const { createBot } = require("./bot");
const { createDashboard } = require("./dashboard");

// ─── Validate env ────────────────────────────────────────────────────
const required = ["TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing env var: ${key}`);
    process.exit(1);
  }
}

// ─── Start dashboard ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const app = createDashboard();

app.listen(PORT, () => {
  console.log(`🖥  Dashboard running on http://localhost:${PORT}`);
});

// ─── Start bot ───────────────────────────────────────────────────────
const bot = createBot(process.env.TELEGRAM_BOT_TOKEN);

// Use webhook in production, polling in dev
if (process.env.WEBHOOK_URL) {
  const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  app.use(bot.webhookCallback(webhookPath));

  bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`).then(() => {
    console.log("🤖 Bot running with webhook");
  });
} else {
  bot.launch().then(() => {
    console.log("🤖 Bot running with polling");
  });
}

// ─── Graceful shutdown ───────────────────────────────────────────────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
