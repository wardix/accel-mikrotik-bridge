import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';

const app = new Hono();

// Middleware Basic Auth
app.use(
  '/rest/*',
  basicAuth({
    username: process.env.AUTH_USERNAME || 'admin',
    password: process.env.AUTH_PASSWORD || 'password123',
  })
);

interface MikrotikActiveSession {
  '.id': string;
  name: string;
  address: string;
  uptime: string;
}

function parseAccelUptimeToMikrotik(accelUptime: string): string {
  let days = 0;
  let timeStr = accelUptime.trim();

  if (timeStr.includes('.')) {
    const [dStr, rest] = timeStr.split('.');
    days = parseInt(dStr, 10) || 0;
    timeStr = rest;
  }

  const parts = timeStr.split(':').map((p) => parseInt(p, 10) || 0);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;

  const weeks = Math.floor(days / 7);
  const remDays = days % 7;

  const partsList: string[] = [];
  if (weeks > 0) partsList.push(`${weeks}w`);
  if (remDays > 0) partsList.push(`${remDays}d`);
  if (hours > 0) partsList.push(`${hours}h`);
  if (minutes > 0) partsList.push(`${minutes}m`);
  if (seconds > 0 || partsList.length === 0) partsList.push(`${seconds}s`);

  return partsList.join('');
}

async function getActiveSessionsForInstance(port?: string): Promise<MikrotikActiveSession[]> {
  try {
    const cmd = process.env.ACCEL_CMD || 'accel-cmd';
    const argsStr = process.env.ACCEL_ARGS || 'show sessions ifname,username,ip,uptime';
    const args = argsStr.split(' ');
    
    // Jika ada port, sisipkan flag -p <port>
    const spawnArgs = port ? [cmd, '-p', port, ...args] : [cmd, ...args];
    
    const proc = Bun.spawn(spawnArgs);
    const rawOutput = await new Response(proc.stdout).text();

    const lines = rawOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('-') && !line.includes('username'));

    const sessions: MikrotikActiveSession[] = [];

    for (const line of lines) {
      const cols = line.split('|').map((col) => col.trim());
      if (cols.length >= 4) {
        const [ifname, username, ip, rawUptime] = cols;

        sessions.push({
          '.id': ifname,
          name: username,
          address: ip,
          uptime: parseAccelUptimeToMikrotik(rawUptime),
        });
      }
    }

    return sessions;
  } catch (error) {
    console.error(`Error executing accel-cmd for port ${port || 'default'}:`, error);
    return []; // Return kosong agar tidak merusak gabungan data jika 1 instance error
  }
}

async function getAllActiveSessionsJson(): Promise<MikrotikActiveSession[]> {
  const instancesEnv = process.env.ACCEL_INSTANCES;
  
  // Jika ACCEL_INSTANCES tidak disetel, gunakan perilaku bawaan
  if (!instancesEnv) {
    return await getActiveSessionsForInstance();
  }

  const ports = instancesEnv.split(',').map((p) => p.trim()).filter(Boolean);
  
  // Jika kosong setelah di-split, gunakan perilaku bawaan
  if (ports.length === 0) {
    return await getActiveSessionsForInstance();
  }

  // Tarik data dari semua instance secara paralel
  const promises = ports.map((port) => getActiveSessionsForInstance(port));
  const results = await Promise.all(promises);
  
  // Gabungkan (flatten) array of arrays menjadi satu array
  return results.flat();
}

app.get('/rest/ppp/active', async (c) => {
  const sessions = await getAllActiveSessionsJson();
  return c.json(sessions);
});

export default {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  fetch: app.fetch,
};
