# Conectar Mi entrenador con Strava (paso a paso)

Tiempo: unos 15 minutos. Todo es gratis. Tu **Client Secret** solo lo pegas tú en Cloudflare: no va en la app, ni en GitHub, ni en el chat.

## A. Crear tu cuenta de Cloudflare
1. Entra a **dash.cloudflare.com/sign-up**.
2. Escribe tu correo y una contraseña y toca **Sign up**.
3. Abre el correo que te manda Cloudflare y confirma tu cuenta.
4. Si te pregunta qué quieres hacer o te ofrece planes, elige el **Free** o sáltate esa parte. No necesitas dominio ni tarjeta.

## B. Crear el Worker
1. En el menú de la izquierda entra a **Workers & Pages** (o **Compute → Workers**).
2. Toca **Create** → **Create Worker** (o "Start with Hello World").
3. En el nombre escribe: `mi-entrenador` y toca **Deploy**.
4. Cloudflare te muestra la dirección del Worker, algo como
   `https://mi-entrenador.TU-NOMBRE.workers.dev`. **Cópiala**: la vas a usar 2 veces.
5. Toca **Edit code**. Borra todo lo que hay en el editor.
6. Abre el archivo `worker/worker.js` de esta carpeta, copia **todo** y pégalo en el editor.
7. Toca **Deploy** (arriba a la derecha).

## C. Crear la "nube" (KV) donde se guarda tu copia
1. En el menú de la izquierda: **Storage & Databases → KV** (a veces dice **Workers KV**).
2. Toca **Create** (o **Create namespace**) y ponle de nombre: `mi-entrenador-datos`. Toca **Add / Create**.
3. Regresa a **Workers & Pages → mi-entrenador → Settings → Bindings**.
4. Toca **Add** → **KV namespace**.
   - Variable name: `DATOS` (así, en mayúsculas)
   - KV namespace: `mi-entrenador-datos`
5. Toca **Deploy / Save**.

## D. Pegar tu Client ID y tu Client Secret (tú, en Cloudflare)
Ten abierta en otra pestaña **strava.com/settings/api** para copiar los datos.
1. En **Workers & Pages → mi-entrenador → Settings → Variables and Secrets** toca **Add**.
2. Primera variable:
   - Type: **Text**
   - Variable name: `STRAVA_CLIENT_ID`
   - Value: tu **Client ID** de Strava (es un número)
3. Toca **Add** otra vez. Segunda variable:
   - Type: **Secret**  ← importante, así nadie la puede ver después
   - Variable name: `STRAVA_CLIENT_SECRET`
   - Value: tu **Client Secret** de Strava
4. Toca **Deploy**.
5. Prueba: abre en el navegador la dirección de tu Worker. Debe salir algo como
   `{"ok":true,"app":"mi-entrenador","kv":true}`. Si `kv` dice `false`, revisa el paso C.4.

## E. Decirle a Strava cuál es tu Worker
1. Entra a **strava.com/settings/api** y toca **Edit**.
2. En **Authorization Callback Domain** escribe solo el dominio del Worker, **sin** `https://` y **sin** `/` al final:
   `mi-entrenador.TU-NOMBRE.workers.dev`
3. Toca **Update**.

## F. Conectar desde tu celular
1. Abre **Mi entrenador** (la que instalaste en tu pantalla de inicio).
2. Ve a **Ajustes → Strava y nube** y pega la dirección del Worker (`https://mi-entrenador.TU-NOMBRE.workers.dev`). Debe salir "Worker listo ✓".
3. Toca **Conectar Strava**. Se abre Strava: inicia sesión si te lo pide y toca **Autorizar**. Deja marcada la casilla de ver tus actividades.
4. Cuando veas "¡Strava conectado!", cierra esa ventana (Listo / ✕) y regresa a la app. En unos segundos arriba sale 🟢 **Sincronizado**.

## G. Hevy → Strava (para las pesas)
1. En Hevy: **Perfil → ⚙️ Ajustes** y busca **Strava** (en Integraciones o Apps conectadas). Conéctalo.
2. Haz un entrenamiento de prueba corto (2 ejercicios, 2 series cada uno, con peso) y termínalo.
3. Revisa que aparezca en Strava y avísale a Claude para terminar el lector de pesos.

## Si algo falla
- **"Falta un permiso"**: vuelve a conectar y deja marcada la casilla de actividades.
- **Strava dice "redirect_uri invalid"**: el Callback Domain (paso E) no coincide con el dominio del Worker.
- **🔴 Sin conexión**: no pasa nada; todo queda guardado en el celular y se sube solo cuando regrese la señal.
- **🟡 X pendientes por mucho tiempo**: toca la barra de arriba para reintentar; si sigue, revisa que el Worker responda (paso D.5).
