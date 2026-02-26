const { Telegraf, Markup } = require("telegraf");
const { generateScripts, analyzePerformance } = require("./ai");
const db = require("./db");

const ALLOWED_USER_ID = process.env.TELEGRAM_USER_ID
  ? parseInt(process.env.TELEGRAM_USER_ID)
  : null;

function createBot(token) {
  const bot = new Telegraf(token);

  // ─── Auth middleware ──────────────────────────────────────────────
  bot.use((ctx, next) => {
    if (ALLOWED_USER_ID && ctx.from?.id !== ALLOWED_USER_ID) {
      return ctx.reply("⛔ No autorizado.");
    }
    return next();
  });

  // ─── /start ───────────────────────────────────────────────────────
  bot.start((ctx) =>
    ctx.reply(
      `🎬 *Content Factory*\n\n` +
        `Mandame cualquiera de estas cosas y te genero guiones:\n\n` +
        `📝 Un tweet o hilo (pegá el texto)\n` +
        `📰 Un artículo (pegá el texto)\n` +
        `💡 Una idea suelta\n\n` +
        `*Comandos:*\n` +
        `/pendientes — Guiones por grabar\n` +
        `/grabados — Guiones grabados\n` +
        `/subidos — Guiones subidos\n` +
        `/stats — Resumen de tu pipeline\n` +
        `/analizar — Análisis de rendimiento con IA\n` +
        `/dashboard — Link al tablero web`,
      { parse_mode: "Markdown" }
    )
  );

  // ─── /stats ───────────────────────────────────────────────────────
  bot.command("stats", (ctx) => {
    const counts = db.getStatusCounts.all();
    const map = {};
    counts.forEach((c) => (map[c.status] = c.count));

    const total =
      (map.pending || 0) +
      (map.queued || 0) +
      (map.recorded || 0) +
      (map.uploaded || 0);

    ctx.reply(
      `📊 *Pipeline de contenido*\n\n` +
        `📋 Pendientes: ${map.pending || 0}\n` +
        `🎯 Por grabar: ${map.queued || 0}\n` +
        `🎥 Grabados: ${map.recorded || 0}\n` +
        `✅ Subidos: ${map.uploaded || 0}\n` +
        `━━━━━━━━━━━━━\n` +
        `Total: ${total} guiones`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /pendientes ──────────────────────────────────────────────────
  bot.command("pendientes", (ctx) => sendScriptList(ctx, "pending", "📋 Pendientes"));
  bot.command("porgrabar", (ctx) => sendScriptList(ctx, "queued", "🎯 Por grabar"));
  bot.command("grabados", (ctx) => sendScriptList(ctx, "recorded", "🎥 Grabados"));
  bot.command("subidos", (ctx) => sendScriptList(ctx, "uploaded", "✅ Subidos"));

  // ─── /dashboard ───────────────────────────────────────────────────
  bot.command("dashboard", (ctx) => {
    const url = process.env.DASHBOARD_URL || "http://localhost:3000";
    ctx.reply(`🖥 Tu tablero: ${url}`);
  });

  // ─── /analizar ────────────────────────────────────────────────────
  bot.command("analizar", async (ctx) => {
    const scripts = db.getScriptsWithMetrics.all();
    if (scripts.length < 3) {
      return ctx.reply(
        "📊 Necesitás al menos 3 videos con métricas para analizar. " +
          "Subí videos y cargá sus métricas primero."
      );
    }

    await ctx.reply("🔍 Analizando rendimiento... dame un momento.");

    try {
      const data = scripts.map((s) => ({
        id: s.id,
        hook: s.hook,
        structure: s.structure,
        topic: s.topic_name,
        angle: s.angle,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        avg_watch_time: s.avg_watch_time,
        full_watch_rate: s.full_watch_rate,
      }));

      const analysis = await analyzePerformance(data);

      // Save analysis
      const weekStart = new Date().toISOString().split("T")[0];
      db.insertAnalysis.run(
        weekStart,
        analysis.resumen,
        JSON.stringify(analysis)
      );

      let msg = `📊 *Análisis de rendimiento*\n\n${analysis.resumen}\n\n`;

      msg += `*🔍 Patrones detectados:*\n`;
      for (const p of analysis.patrones || []) {
        msg += `\n• *${p.tipo}*: ${p.hallazgo}\n  📈 ${p.evidencia}\n  ➡️ ${p.accion}\n`;
      }

      msg += `\n*🎯 Top 3 recomendaciones:*\n`;
      for (const r of analysis.top_3_recomendaciones || []) {
        msg += `• ${r}\n`;
      }

      if (analysis.evitar?.length) {
        msg += `\n*🚫 Evitar:*\n`;
        for (const e of analysis.evitar) {
          msg += `• ${e}\n`;
        }
      }

      // Split long messages (Telegram limit is 4096)
      if (msg.length > 4000) {
        const mid = msg.lastIndexOf("\n", 2000);
        await ctx.reply(msg.substring(0, mid), { parse_mode: "Markdown" });
        await ctx.reply(msg.substring(mid), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(msg, { parse_mode: "Markdown" });
      }
    } catch (err) {
      console.error("Analysis error:", err);
      ctx.reply("❌ Error analizando. Intentá de nuevo.");
    }
  });

  // ─── Callback queries (inline buttons) ────────────────────────────
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Status change: status:scriptId:newStatus
    if (data.startsWith("status:")) {
      const [, idStr, newStatus] = data.split(":");
      const id = parseInt(idStr);
      db.updateScriptStatus.run(newStatus, id);

      const statusLabels = {
        pending: "📋 Pendiente",
        queued: "🎯 Por grabar",
        recorded: "🎥 Grabado",
        uploaded: "✅ Subido",
      };

      await ctx.answerCbQuery(`Movido a ${statusLabels[newStatus]}`);
      await ctx.editMessageReplyMarkup(
        buildStatusKeyboard(id, newStatus).reply_markup
      );
    }

    // View full script: view:scriptId
    if (data.startsWith("view:")) {
      const id = parseInt(data.split(":")[1]);
      const script = db.getScriptById.get(id);
      if (!script) return ctx.answerCbQuery("No encontrado");

      await ctx.answerCbQuery();
      await ctx.reply(
        `🎬 *Guión #${script.id}*\n` +
          `📂 ${script.topic_name}\n` +
          `🏷 ${script.structure}\n\n` +
          `*🪝 HOOK:*\n${script.hook}\n\n` +
          `*📝 DESARROLLO:*\n${script.body}\n\n` +
          `*📢 CTA:*\n${script.cta}\n\n` +
          `⏱ ${script.duration} | 🎥 ${script.visual_format}\n` +
          `🎯 Ángulo: ${script.angle}`,
        {
          parse_mode: "Markdown",
          ...buildStatusKeyboard(script.id, script.status),
        }
      );
    }

    // Metrics prompt: metrics:scriptId
    if (data.startsWith("metrics:")) {
      const id = parseInt(data.split(":")[1]);
      await ctx.answerCbQuery();
      await ctx.reply(
        `📊 *Cargar métricas para guión #${id}*\n\n` +
          `Mandame los números en este formato:\n` +
          `/metricas ${id} views likes comments shares\n\n` +
          `Ejemplo:\n` +
          `/metricas ${id} 15000 450 23 12`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // ─── /metricas command ────────────────────────────────────────────
  bot.command("metricas", (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    // /metricas ID views likes comments shares [avg_watch] [full_rate]
    if (parts.length < 6) {
      return ctx.reply(
        "Formato: `/metricas ID views likes comments shares`\n" +
          "Opcional: `/metricas ID views likes comments shares avg_watch_sec full_watch_rate`",
        { parse_mode: "Markdown" }
      );
    }

    const id = parseInt(parts[1]);
    const views = parseInt(parts[2]);
    const likes = parseInt(parts[3]);
    const comments = parseInt(parts[4]);
    const shares = parseInt(parts[5]);
    const avgWatch = parts[6] ? parseFloat(parts[6]) : null;
    const fullRate = parts[7] ? parseFloat(parts[7]) : null;

    const script = db.getScriptById.get(id);
    if (!script) return ctx.reply(`❌ No existe el guión #${id}`);

    db.updateScriptMetrics.run(
      views, likes, comments, shares, null, avgWatch, fullRate, id
    );

    const engagement = views > 0 ? (((likes + comments + shares) / views) * 100).toFixed(1) : 0;

    ctx.reply(
      `✅ Métricas cargadas para guión #${id}\n\n` +
        `👁 ${views.toLocaleString()} views\n` +
        `❤️ ${likes.toLocaleString()} likes\n` +
        `💬 ${comments} comments\n` +
        `🔄 ${shares} shares\n` +
        `📈 Engagement: ${engagement}%` +
        (avgWatch ? `\n⏱ Watch time: ${avgWatch}s` : "") +
        (fullRate ? `\n👀 Full watch: ${fullRate}%` : "")
    );
  });

  // ─── Process any text message as content ──────────────────────────
  bot.on("text", async (ctx) => {
    const text = ctx.message.text;

    // Skip commands
    if (text.startsWith("/")) return;

    // Detect content type
    let type = "idea";
    if (text.length > 500) type = "article";
    else if (text.includes("@") || text.length < 300) type = "tweet";

    await ctx.reply(
      `⚡ Procesando ${type === "article" ? "artículo" : type === "tweet" ? "tweet" : "idea"}... generando guiones.`
    );

    try {
      const result = await generateScripts(text);

      if (!result.temas || result.temas.length === 0) {
        return ctx.reply("❌ No pude extraer temas de ese contenido. Intentá con otro.");
      }

      // Save to DB
      const { sourceId, scriptIds } = db.saveGeneration(type, text, result.temas);

      // Count total scripts
      let totalScripts = 0;
      for (const t of result.temas) {
        totalScripts += t.guiones?.length || 0;
      }

      await ctx.reply(
        `✅ *${result.temas.length} temas* → *${totalScripts} guiones* generados\n\n` +
          `Fuente guardada como #${sourceId}`,
        { parse_mode: "Markdown" }
      );

      // Send each topic with its scripts
      let scriptIndex = 0;
      for (const tema of result.temas) {
        let topicMsg = `📂 *${tema.tema}*\n${tema.descripcion || ""}\n\n`;

        for (const guion of tema.guiones || []) {
          const sid = scriptIds[scriptIndex];
          topicMsg += `━━━━━━━━━━━━━\n`;
          topicMsg += `🪝 *${guion.hook}*\n`;
          topicMsg += `🏷 ${guion.estructura} | ⏱ ${guion.duracion_estimada}\n\n`;
          scriptIndex++;
        }

        // Build inline buttons for each script in this topic
        const buttons = [];
        const startIdx = scriptIndex - (tema.guiones?.length || 0);
        for (let i = 0; i < (tema.guiones?.length || 0); i++) {
          const sid = scriptIds[startIdx + i];
          buttons.push([
            Markup.button.callback(`👁 Ver guión #${sid}`, `view:${sid}`),
            Markup.button.callback(`🎯 Por grabar`, `status:${sid}:queued`),
          ]);
        }

        await ctx.reply(topicMsg, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard(buttons),
        });
      }
    } catch (err) {
      console.error("Generation error:", err);
      ctx.reply(
        "❌ Error generando guiones. Revisá que el contenido tenga sentido y volvé a intentar."
      );
    }
  });

  // ─── Document handler (CSV upload for metrics) ────────────────────
  bot.on("document", async (ctx) => {
    const file = ctx.message.document;
    if (!file.file_name?.endsWith(".csv")) {
      return ctx.reply("📎 Por ahora solo proceso archivos CSV de TikTok analytics.");
    }

    await ctx.reply("📊 Procesando CSV de TikTok...");

    try {
      const fileLink = await ctx.telegram.getFileLink(file.file_id);
      const response = await fetch(fileLink.href);
      const csvText = await response.text();

      // Try to parse and match with existing scripts
      const { parse } = require("csv-parse/sync");
      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      });

      let matched = 0;
      let unmatched = 0;

      // Get all uploaded scripts to try matching by URL or by order
      const uploadedScripts = db.getScriptsByStatus.all("uploaded");

      for (const record of records) {
        // Try to find views column (TikTok exports vary)
        const views =
          parseInt(record["Video views"] || record["Views"] || record["views"]) || 0;
        const likes =
          parseInt(record["Likes"] || record["likes"]) || 0;
        const comments =
          parseInt(record["Comments"] || record["comments"]) || 0;
        const shares =
          parseInt(record["Shares"] || record["shares"]) || 0;
        const favorites =
          parseInt(record["Favorites"] || record["favorites"]) || 0;
        const avgWatch =
          parseFloat(record["Average time watched(Seconds)"] || record["Average watch time"] || 0) || null;
        const fullRate =
          parseFloat(record["Watched full video(%)"] || record["Watched full video"] || 0) || null;

        // Try to match by TikTok URL
        const url = record["Video link"] || record["URL"] || record["url"] || "";
        if (url) {
          const matchedScript = uploadedScripts.find(
            (s) => s.tiktok_url && s.tiktok_url === url
          );
          if (matchedScript) {
            db.updateScriptMetrics.run(
              views, likes, comments, shares, favorites, avgWatch, fullRate,
              matchedScript.id
            );
            matched++;
            continue;
          }
        }

        unmatched++;
      }

      await ctx.reply(
        `📊 CSV procesado:\n\n` +
          `✅ ${matched} videos matcheados con guiones\n` +
          `❓ ${unmatched} videos sin guión asociado\n\n` +
          (unmatched > 0
            ? `Para los no matcheados, asegurate de que cada guión subido tenga su URL de TikTok cargada.`
            : `¡Todo matcheado! Usá /analizar para ver patrones.`)
      );
    } catch (err) {
      console.error("CSV processing error:", err);
      ctx.reply("❌ Error procesando el CSV. Asegurate de que sea un export de TikTok Analytics.");
    }
  });

  return bot;
}

function buildStatusKeyboard(scriptId, currentStatus) {
  const statuses = [
    { key: "pending", label: "📋 Pendiente" },
    { key: "queued", label: "🎯 Por grabar" },
    { key: "recorded", label: "🎥 Grabado" },
    { key: "uploaded", label: "✅ Subido" },
  ];

  const buttons = statuses
    .filter((s) => s.key !== currentStatus)
    .map((s) => Markup.button.callback(s.label, `status:${scriptId}:${s.key}`));

  const rows = [buttons];

  if (currentStatus === "uploaded") {
    rows.push([
      Markup.button.callback("📊 Cargar métricas", `metrics:${scriptId}`),
    ]);
  }

  return Markup.inlineKeyboard(rows);
}

function sendScriptList(ctx, status, title) {
  const scripts = db.getScriptsByStatus.all(status);

  if (scripts.length === 0) {
    return ctx.reply(`${title}: No hay guiones en este estado.`);
  }

  let msg = `${title} (${scripts.length}):\n\n`;

  const buttons = [];
  for (const s of scripts.slice(0, 20)) {
    msg += `#${s.id} — 🪝 ${s.hook.substring(0, 50)}...\n`;
    buttons.push([
      Markup.button.callback(`👁 #${s.id}`, `view:${s.id}`),
    ]);
  }

  if (scripts.length > 20) {
    msg += `\n... y ${scripts.length - 20} más. Mirá el dashboard para ver todos.`;
  }

  ctx.reply(msg, Markup.inlineKeyboard(buttons));
}

module.exports = { createBot };
