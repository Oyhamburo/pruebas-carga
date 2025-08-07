function logResponse(_, res, context, ee, next) {
  try {
    const body = res.body ? JSON.parse(res.body) : null;
    console.log("🔁 Respuesta del servidor:", body);
  } catch (error) {
    console.log("❌ Error al parsear respuesta:", res.body);
  }
  return next();
}

function normalizeTypes(requestParams, context, ee, next) {
  // Usar los valores crudos del CSV en context.vars
  const vars = context.vars;

  try {
    requestParams.json = {
      email: vars.email,
      password: vars.password,
      name: vars.name,
      lastname: vars.lastname,
      uuid: vars.uuid,
      dni: Number(vars.dni),
      phone: Number(vars.phone),
      occupation: vars.occupation,
      instagram: vars.instagram,
      user_location: vars.user_location,
      birth_date: vars.birth_date,
      notification_token: vars.notification_token,
    };

    console.log("✅ Payload armado correctamente:", requestParams.json);
  } catch (err) {
    console.log("❌ Error construyendo requestParams.json");
  }

  return next();
}

module.exports = {
  logResponse,
  normalizeTypes,
};
