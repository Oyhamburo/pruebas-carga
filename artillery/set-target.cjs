// Log al cargar el módulo
console.log("[Processor] Archivo cargado ✅ (top-level)");

function dumpContext(tag, context) {
  const target = context?.config?.target;
  const vars = context?.vars || {};
  const keys = Object.keys(vars);
  console.log(`[Processor] ${tag} :: target=${target}`);
  console.log(`[Processor] ${tag} :: vars keys=`, keys);
  console.log(`[Processor] ${tag} :: vars.token (slice)=`, vars.token ? String(vars.token).slice(0, 24) + "..." : "(null)");
}

function injectTokenToTarget(context) {
  dumpContext("ANTES", context);
  const token = context?.vars?.token;
  let base = context?.config?.target || "";
  if (base.includes("?")) base = base.replace(/\?+.*/, "");
  if (token && base) {
    const newTarget = `${base}?token=${encodeURIComponent(token)}&lastMessageTimeStamp=${Date.now()}`;
    context.config.target = newTarget;
    console.log("[Processor] INYECTADO target =>", newTarget);
  } else {
    console.log("[Processor] NO INYECTA (hasToken/base):", !!token, !!base);
  }
  dumpContext("DESPUES", context);
}

module.exports.beforeScenario = function (context, events, done) {
  console.log("[Processor] beforeScenario 🔧");
  injectTokenToTarget(context);
  done();
};

module.exports.socketio = {
  beforeConnect(req, context, ee, next) {
    console.log("[Processor] socketio.beforeConnect 🔌 (req keys):", req ? Object.keys(req) : "(null)");
    injectTokenToTarget(context);
    next();
  }
};
