/**
 * k6 Stress Test - RestroLogic
 *
 * Prueba de estrés básica para una sucursal
 *
 * Instalación k6 (Windows):
 * choco install k6
 *
 * Ejecución:
 * k6 run stress-test-basic.js
 *
 * Con variables de entorno:
 * $env:TENANT_ID="tu-tenant-id"; $env:BRANCH_ID="tu-branch-id"; $env:JWT_TOKEN="tu-token"; k6 run stress-test-basic.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Métricas personalizadas
const errorRate = new Rate("errors");
const orderCreationTime = new Trend("order_creation_duration");
const paymentTime = new Trend("payment_duration");

// Configuración de la prueba
export let options = {
  stages: [
    { duration: "30s", target: 5 }, // Rampa: 0 → 5 usuarios en 30s
    { duration: "2m", target: 5 }, // Sostenido: 5 usuarios por 2 min
    { duration: "30s", target: 10 }, // Rampa: 5 → 10 usuarios en 30s
    { duration: "2m", target: 10 }, // Sostenido: 10 usuarios por 2 min
    { duration: "30s", target: 0 }, // Bajada: 10 → 0 usuarios en 30s
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% de requests <2s
    http_req_failed: ["rate<0.05"], // <5% de fallos
    errors: ["rate<0.05"], // <5% de errores custom
    order_creation_duration: ["p(95)<3000"], // Crear orden <3s (P95)
    payment_duration: ["p(95)<2000"], // Pago <2s (P95)
  },
};

// Configuración del entorno
const BASE_URL = __ENV.BASE_URL || "http://localhost:4200/api/v1";
const TENANT_ID = __ENV.TENANT_ID || "test-tenant";
const BRANCH_ID = __ENV.BRANCH_ID || "test-branch";
const JWT_TOKEN = __ENV.JWT_TOKEN || "";

// Datos de prueba
const TEST_PRODUCTS = [
  { id: "prod-1", name: "Pizza Margarita", price: 25000 },
  { id: "prod-2", name: "Hamburguesa", price: 18000 },
  { id: "prod-3", name: "Ensalada César", price: 15000 },
  { id: "prod-4", name: "Pasta Carbonara", price: 22000 },
];

const TEST_TABLES = ["table-1", "table-2", "table-3", "table-4", "table-5"];

/**
 * Setup: Se ejecuta una vez al inicio
 */
export function setup() {
  console.log("🚀 Iniciando prueba de estrés...");
  console.log(`📍 Tenant: ${TENANT_ID}, Branch: ${BRANCH_ID}`);
  console.log(`🔗 Base URL: ${BASE_URL}`);
  return { startTime: new Date().toISOString() };
}

/**
 * Escenario principal: Simula mesero creando y gestionando órdenes
 */
export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${JWT_TOKEN}`,
  };

  // 1. Crear una orden
  const orderId = createOrder(headers);

  if (orderId) {
    // 2. Agregar items a la orden
    addItemsToOrder(orderId, headers);

    // 3. Simular espera (cliente comiendo)
    sleep(2);

    // 4. Registrar pago
    registerPayment(orderId, headers);
  }

  // Pausa entre ciclos
  sleep(1);
}

/**
 * Crear una orden
 */
function createOrder(headers) {
  const tableId = TEST_TABLES[Math.floor(Math.random() * TEST_TABLES.length)];

  const orderPayload = {
    tableId: tableId,
    status: "pending",
    type: "dine_in",
    items: [
      {
        productId: TEST_PRODUCTS[0].id,
        quantity: 1,
        price: TEST_PRODUCTS[0].price,
      },
    ],
  };

  const url = `${BASE_URL}/tenant/${TENANT_ID}/branch/${BRANCH_ID}/orders`;

  const startTime = new Date();
  const response = http.post(url, JSON.stringify(orderPayload), { headers });
  const duration = new Date() - startTime;

  orderCreationTime.add(duration);

  const success = check(response, {
    "order created (201)": (r) => r.status === 201,
    "order has id": (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.data?.id !== undefined;
      } catch {
        return false;
      }
    },
    "response time OK": (r) => r.timings.duration < 3000,
  });

  if (!success) {
    errorRate.add(1);
    console.error(
      `❌ Failed to create order: ${response.status} ${response.body}`
    );
    return null;
  }

  errorRate.add(0);

  try {
    const json = JSON.parse(response.body);
    return json.data.id;
  } catch (e) {
    console.error("❌ Failed to parse order response:", e);
    return null;
  }
}

/**
 * Agregar items a una orden
 */
function addItemsToOrder(orderId, headers) {
  // Agregar 1-3 items adicionales
  const itemsToAdd = Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < itemsToAdd; i++) {
    const product =
      TEST_PRODUCTS[Math.floor(Math.random() * TEST_PRODUCTS.length)];
    const quantity = Math.floor(Math.random() * 3) + 1;

    const itemPayload = {
      productId: product.id,
      quantity: quantity,
      price: product.price,
    };

    const url = `${BASE_URL}/tenant/${TENANT_ID}/branch/${BRANCH_ID}/orders/${orderId}/items`;
    const response = http.post(url, JSON.stringify(itemPayload), { headers });

    const success = check(response, {
      "item added": (r) => r.status === 200 || r.status === 201,
    });

    if (!success) {
      errorRate.add(1);
      console.error(`❌ Failed to add item to order ${orderId}`);
    } else {
      errorRate.add(0);
    }

    sleep(0.5); // Pausa entre items
  }
}

/**
 * Registrar pago
 */
function registerPayment(orderId, headers) {
  const paymentPayload = {
    amount: Math.floor(Math.random() * 50000) + 20000,
    method: "cash",
    status: "completed",
  };

  const url = `${BASE_URL}/tenant/${TENANT_ID}/branch/${BRANCH_ID}/orders/${orderId}/payment`;

  const startTime = new Date();
  const response = http.post(url, JSON.stringify(paymentPayload), { headers });
  const duration = new Date() - startTime;

  paymentTime.add(duration);

  const success = check(response, {
    "payment registered": (r) => r.status === 200 || r.status === 201,
    "payment response time OK": (r) => r.timings.duration < 2000,
  });

  if (!success) {
    errorRate.add(1);
    console.error(`❌ Failed to register payment for order ${orderId}`);
  } else {
    errorRate.add(0);
  }
}

/**
 * Teardown: Se ejecuta una vez al final
 */
export function teardown(data) {
  console.log("✅ Prueba de estrés completada");
  console.log(`⏱️ Inicio: ${data.startTime}`);
  console.log(`⏱️ Fin: ${new Date().toISOString()}`);
}

/**
 * Ejemplo de ejecución:
 *
 * Windows PowerShell:
 * $env:TENANT_ID="tenant-123"; $env:BRANCH_ID="branch-456"; $env:JWT_TOKEN="eyJhbGc..."; k6 run stress-test-basic.js
 *
 * Linux/Mac:
 * TENANT_ID=tenant-123 BRANCH_ID=branch-456 JWT_TOKEN=eyJhbGc... k6 run stress-test-basic.js
 *
 * Salida esperada:
 *
 * running (5m00.0s), 00/10 VUs, 150 complete and 0 interrupted iterations
 *
 * ✓ order created (201)
 * ✓ order has id
 * ✓ response time OK
 * ✓ item added
 * ✓ payment registered
 * ✓ payment response time OK
 *
 * checks.........................: 99.5%  ✓ 1493      ✗ 7
 * data_received..................: 1.2 MB 4.0 kB/s
 * data_sent......................: 890 kB 3.0 kB/s
 * errors.........................: 0.5%   ✓ 7         ✗ 1493
 * http_req_blocked...............: avg=1.2ms    min=0s     med=0s      max=50ms   p(90)=2ms    p(95)=5ms
 * http_req_connecting............: avg=0.5ms    min=0s     med=0s      max=30ms   p(90)=1ms    p(95)=2ms
 * http_req_duration..............: avg=450ms    min=50ms   med=350ms   max=1.8s   p(90)=800ms  p(95)=1.2s
 * http_req_failed................: 0.5%   ✓ 7         ✗ 1493
 * http_req_receiving.............: avg=0.2ms    min=0s     med=0s      max=10ms   p(90)=0.5ms  p(95)=1ms
 * http_req_sending...............: avg=0.1ms    min=0s     med=0s      max=5ms    p(90)=0.2ms  p(95)=0.5ms
 * http_req_waiting...............: avg=449ms    min=50ms   med=349ms   max=1.8s   p(90)=799ms  p(95)=1.2s
 * http_reqs......................: 1500   5/s
 * iteration_duration.............: avg=6s       min=3s     med=5.5s    max=15s    p(90)=8s     p(95)=10s
 * iterations.....................: 150    0.5/s
 * order_creation_duration........: avg=500ms    min=100ms  med=400ms   max=2.5s   p(90)=900ms  p(95)=1.5s
 * payment_duration...............: avg=400ms    min=80ms   med=350ms   max=1.5s   p(90)=700ms  p(95)=1s
 * vus............................: 0      min=0       max=10
 * vus_max........................: 10     min=10      max=10
 */
