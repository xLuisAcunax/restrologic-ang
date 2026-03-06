#!/usr/bin/env node

/**
 * Stress Test Script - RestroLogic (Node.js)
 *
 * Script de prueba de estrés sin dependencias externas
 * Funciona directamente en Windows PowerShell
 *
 * Uso:
 * node stress-test-node.js
 *
 * Con variables de entorno personalizadas:
 * $env:BASE_URL="http://localhost:4200/api/v1"; $env:TENANT_ID="test-tenant"; node stress-test-node.js
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

// Configuración
const BASE_URL = process.env.BASE_URL || "http://localhost:4000/api/v1";
const TENANT_ID = process.env.TENANT_ID || "6900e3bd9254fd0d2eb3cb0f";
const BRANCH_ID = process.env.BRANCH_ID || "6900e4019254fd0d2eb3cb11";
const JWT_TOKEN =
  process.env.JWT_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTAwZTNiZDkyNTRmZDBkMmViM2NiMTAiLCJuYW1lIjoiQ29zbWUgRnVsYW5pdG8iLCJkb2N1bWVudElkIjoiMTExMTExMTExMSIsImVtYWlsIjoiY29zbWVAZnVsYW5pdG8uY29tIiwicm9sZXMiOlsiQURNSU4iXSwidGVuYW50SWQiOiI2OTAwZTNiZDkyNTRmZDBkMmViM2NiMGYiLCJicmFuY2hJZCI6bnVsbCwiaXNTdXBlciI6ZmFsc2UsImlhdCI6MTc2NDk4Nzc3MSwiZXhwIjoxNzY1MDc0MTcxfQ.IrImBE-zaedeQ85ENajO0MMf2VRbJsOkbSOeS6v_j1Y";

// Parámetros de carga (reducidos para pruebas rápidas)
const PHASES = [
  { name: "Rampa inicial", users: 5, duration: 10000 }, // 5 usuarios x 10s
  { name: "Carga sostenida", users: 5, duration: 20000 }, // 5 usuarios x 20s
  { name: "Rampa a pico", users: 15, duration: 10000 }, // 15 usuarios x 10s
  { name: "Carga pico", users: 15, duration: 20000 }, // 15 usuarios x 20s
];

// Métricas
let metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalErrors: 0,
  responseTimes: [],
  statusCodes: {},
  startTime: Date.now(),
};

// Contador de usuarios activos
let activeUsers = 0;

// Utilidad para hacer requests HTTP
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    try {
      const fullUrl = new URL(BASE_URL + path);
      const protocol = fullUrl.protocol === "https:" ? https : http;

      const options = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || (fullUrl.protocol === "https:" ? 443 : 80),
        path: fullUrl.pathname + fullUrl.search,
        method: method,
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_ID,
          "X-Branch-ID": BRANCH_ID,
          "User-Agent": "RestroLogic-StressTest/1.0",
        },
        timeout: 5000,
      };

      if (JWT_TOKEN) {
        options.headers["Authorization"] = `Bearer ${JWT_TOKEN}`;
      }

      const startTime = Date.now();
      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          const duration = Date.now() - startTime;
          metrics.responseTimes.push(duration);
          metrics.totalRequests++;

          // Registrar código de estado
          metrics.statusCodes[res.statusCode] =
            (metrics.statusCodes[res.statusCode] || 0) + 1;

          if (res.statusCode >= 200 && res.statusCode < 300) {
            metrics.successfulRequests++;
            resolve({ status: res.statusCode, duration });
          } else {
            metrics.failedRequests++;
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        metrics.totalErrors++;
        metrics.failedRequests++;
        reject(new Error("Request timeout"));
      });

      req.on("error", (error) => {
        metrics.totalErrors++;
        metrics.failedRequests++;
        reject(error);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    } catch (error) {
      metrics.totalErrors++;
      reject(error);
    }
  });
}

// Simulación de usuario virtual
async function virtualUser(userId, duration) {
  const startTime = Date.now();
  let requestCount = 0;

  while (Date.now() - startTime < duration) {
    try {
      // Endpoints reales de la aplicación RestroLogic

      // 1. GET órdenes activas para la sucursal
      await makeRequest(
        "GET",
        `/tenant/${TENANT_ID}/branch/${BRANCH_ID}/order/active`
      ).catch(() => {});
      requestCount++;

      // 2. GET menú público (para delivery/takeaway)
      await makeRequest(
        "GET",
        `/public/menu?tenantId=${TENANT_ID}&branchId=${BRANCH_ID}`
      ).catch(() => {});
      requestCount++;

      // 3. GET productos de la sucursal
      await makeRequest(
        "GET",
        `/tenant/${TENANT_ID}/branch/${BRANCH_ID}/product`
      ).catch(() => {});
      requestCount++;

      // 4. GET mesas de la sucursal
      await makeRequest(
        "GET",
        `/tenant/${TENANT_ID}/branch/${BRANCH_ID}/table`
      ).catch(() => {});
      requestCount++;

      // Pequeña pausa entre requests (500ms - 1.5s)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 1000 + 500)
      );
    } catch (error) {
      // Error ya registrado en makeRequest
    }
  }

  return requestCount;
}

// Esperar con intervalo (Promise-based)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ejecutar múltiples usuarios concurrentemente
async function runPhase(users, duration, phaseName) {
  console.log(`\n▶️  ${phaseName}`);
  console.log(`   Usuarios: ${users} | Duración: ${duration / 1000}s`);
  console.log(`   Iniciando...`);

  const userPromises = [];
  const startTime = Date.now();

  for (let i = 0; i < users; i++) {
    userPromises.push(
      (async () => {
        try {
          await virtualUser(i, duration);
        } catch (error) {
          console.error(`   ❌ Usuario ${i} error:`, error.message);
        }
      })()
    );
  }

  // Mostrar progreso cada segundo
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, Math.round((elapsed / duration) * 100));
    process.stdout.write(
      `\r   Progreso: [${progress}%] | Requests: ${metrics.totalRequests}`
    );
  }, 1000);

  await Promise.all(userPromises);
  clearInterval(progressInterval);

  console.log(`\n   ✓ ${phaseName} completada`);
}

// Función principal
async function runStressTest() {
  console.clear();
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║     🚀 STRESS TEST - RestroLogic 🚀      ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`\n📍 Configuración:`);
  console.log(`   URL Base: ${BASE_URL}`);
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Branch: ${BRANCH_ID}`);
  console.log(`   JWT: ${JWT_TOKEN ? "✓ Configurado" : "✗ No configurado"}`);
  console.log(`\n⏳ Iniciando prueba...\n`);

  metrics.startTime = Date.now();

  try {
    for (const phase of PHASES) {
      await runPhase(phase.users, phase.duration, phase.name);
    }

    console.log(`\n\n✓ Todas las fases completadas`);
  } catch (error) {
    console.error("\n❌ Error durante el test:", error.message);
  }

  // Pequeña pausa para que terminen los últimos requests
  await sleep(2000);

  // Mostrar resultados
  printResults();
}

// Función para mostrar resultados
function printResults() {
  const totalDuration = (Date.now() - metrics.startTime) / 1000;
  const avgResponseTime =
    metrics.responseTimes.length > 0
      ? Math.round(
          metrics.responseTimes.reduce((a, b) => a + b, 0) /
            metrics.responseTimes.length
        )
      : 0;
  const p95ResponseTime = calculatePercentile(95);
  const p99ResponseTime = calculatePercentile(99);
  const minResponseTime =
    metrics.responseTimes.length > 0 ? Math.min(...metrics.responseTimes) : 0;
  const maxResponseTime =
    metrics.responseTimes.length > 0 ? Math.max(...metrics.responseTimes) : 0;

  const successRate =
    metrics.totalRequests > 0
      ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)
      : 0;
  const errorRate =
    metrics.totalRequests > 0
      ? ((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(2)
      : 0;

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║           📊 RESULTADOS FINALES           ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  console.log("⏱️  TIEMPO DE EJECUCIÓN");
  console.log(`   Duración total: ${totalDuration.toFixed(2)} segundos\n`);

  console.log("📈 ESTADÍSTICAS DE REQUESTS");
  console.log(`   Total enviados: ${metrics.totalRequests}`);
  console.log(`   ✓ Exitosos: ${metrics.successfulRequests} (${successRate}%)`);
  console.log(`   ✗ Fallidos: ${metrics.failedRequests} (${errorRate}%)`);
  console.log(
    `   Requests/segundo: ${(metrics.totalRequests / totalDuration).toFixed(
      2
    )}\n`
  );

  console.log("⏳ TIEMPOS DE RESPUESTA (ms)");
  console.log(`   Mínimo: ${minResponseTime}ms`);
  console.log(`   Promedio: ${avgResponseTime}ms`);
  console.log(`   P95 (95%): ${p95ResponseTime}ms`);
  console.log(`   P99 (99%): ${p99ResponseTime}ms`);
  console.log(`   Máximo: ${maxResponseTime}ms\n`);

  console.log("📊 CÓDIGOS HTTP");
  for (const [code, count] of Object.entries(metrics.statusCodes).sort()) {
    const percentage = ((count / metrics.totalRequests) * 100).toFixed(2);
    console.log(`   ${code}: ${count} (${percentage}%)`);
  }

  console.log(`\n❌ ERRORES TOTALES: ${metrics.totalErrors}\n`);

  console.log("═════════════════════════════════════════════");
  console.log("✅ EVALUACIÓN DE RESULTADOS:\n");

  if (successRate >= 95) {
    console.log("   ✓ Tasa de éxito EXCELENTE (≥95%)");
  } else if (successRate >= 90) {
    console.log("   ⚠️  Tasa de éxito BUENA (≥90%)");
  } else {
    console.log("   ✗ Tasa de éxito BAJA (<90%)");
  }

  if (p95ResponseTime < 1000) {
    console.log("   ✓ P95 de respuesta EXCELENTE (<1000ms)");
  } else if (p95ResponseTime < 2000) {
    console.log("   ⚠️  P95 de respuesta ACEPTABLE (<2000ms)");
  } else {
    console.log("   ✗ P95 de respuesta LENTA (>2000ms)");
  }

  if (avgResponseTime < 500) {
    console.log("   ✓ Tiempo promedio EXCELENTE (<500ms)");
  } else if (avgResponseTime < 1000) {
    console.log("   ⚠️  Tiempo promedio BUENO (<1000ms)");
  } else {
    console.log("   ✗ Tiempo promedio LENTO (>1000ms)");
  }

  if (errorRate < 5) {
    console.log("   ✓ Tasa de error ACEPTABLE (<5%)");
  } else {
    console.log("   ✗ Tasa de error ALTA (≥5%)");
  }

  console.log("\n═════════════════════════════════════════════\n");

  // Recomendaciones
  console.log("💡 RECOMENDACIONES:");
  if (successRate < 90) {
    console.log("   → Revisar los logs del servidor para errores");
    console.log("   → Verificar conectividad con la API");
    console.log("   → Aumentar timeouts si es necesario");
  }
  if (p95ResponseTime > 2000) {
    console.log("   → Optimizar queries en la base de datos");
    console.log("   → Implementar caching en el servidor");
    console.log("   → Revisar la carga del servidor");
  }
  if (errorRate > 5) {
    console.log("   → Implementar retry logic en el cliente");
    console.log("   → Verificar rate limiting en el servidor");
    console.log("   → Revisar los interceptores de resiliencia");
  }

  console.log("\n");
}

// Utilidad para calcular percentil
function calculatePercentile(percentile) {
  if (metrics.responseTimes.length === 0) return 0;

  const sorted = metrics.responseTimes.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)]);
}

// Ejecutar test
runStressTest()
  .catch(console.error)
  .finally(() => {
    process.exit(0);
  });
