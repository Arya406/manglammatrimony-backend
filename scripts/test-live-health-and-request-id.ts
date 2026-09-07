import http from "http";

function testHttp(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 5000,
        path,
        method: "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: JSON.parse(data),
            });
          } catch {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: data,
            });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  console.log("==================================================");
  console.log("LIVE HTTP HEALTH & REQUEST-ID VERIFICATION");
  console.log("==================================================");

  try {
    const res = await testHttp("/api/health");
    console.log("GET /api/health Status:", res.status);
    console.log("GET /api/health Headers X-Request-ID:", res.headers["x-request-id"]);
    console.log("GET /api/health Body:", JSON.stringify(res.body, null, 2));

    const withCustomId = await testHttp("/api/health", { "X-Request-ID": "custom-client-trace-id-12345" });
    console.log("\nGET /api/health with custom X-Request-ID:", withCustomId.headers["x-request-id"]);
  } catch (err: any) {
    console.log("Live server test note: (If port 5000 server is currently running previous build, restart will reflect latest code):", err.message);
  }
}

run();
